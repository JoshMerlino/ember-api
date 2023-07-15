#!/bin/bash
export TERM=xterm-256color
export VERSION="1.1.5"
export VERB=0

# Set if we need to restart
NEEDS_RESTART=false

# Color stuff
RED="\e[38;5;196m"
ORANGE="\e[38;5;166m"
GRAY="\e[38;5;245m"
GREEN="\e[38;5;42m"

# Print version
echo -e "\n🔥 Ember Datacenter "$ORANGE"v$VERSION\e[0m\n";

# Check if root
if [[ $EUID > 0 ]]; then
	echo -e "   "$RED"Error:\e[0m This script must be run as root."
	exit 1
fi

# Check if command is passed
function errorcheck() {
	if [[ $? > 0 ]]; then
		echo -ne $RED"FAILED\e[0m\n\n"
		echo -e "   "$GRAY"Try again with "$ORANGE"--verbose"$GRAY" for more information.\e[0m\n"
		exit 1
	fi
}

# Define help page
function help() {
	echo -e "   This script is used to configure a "$ORANGE"Ember VPN\e[0m instance.\n"
	echo -e "   "$RED"USAGE:\e[0m $0 [--options] command [--flag=value]\n"
	echo -e "   "$ORANGE"OPTIONS:\e[0m"
	echo -e "      -h, --help      Show this help page"
	echo -e "      -v, --verbose   Enable verbose mode"
	echo -e
	echo -e "   "$ORANGE"COMMANDS:\e[0m"
	echo -e "      enroll          Enroll this server as a VPN node"
	echo -e "      update          Update Ember Datacenter"            
	echo -e
}

# Install dependencies
function install() {
	echo -ne "   "$GRAY"Installing dependencies... \e[0m"
	if [[ $VERB = 1 ]]; then
		echo -e
		apt-get update || errorcheck
		apt-get upgrade -y || errorcheck
		apt-get install easy-rsa openvpn curl jq ruby -y || errorcheck
	else
		apt-get update &> /dev/null || errorcheck
		apt-get upgrade -y &> /dev/null || errorcheck
		apt-get install easy-rsa openvpn curl jq ruby -y &> /dev/null || errorcheck
	fi

	# Retrieve the public IPv4 & v6 address
	PUBLIC_IP=$(curl -s http://ipinfo.io/ip)

	# Retrieve the current hostname
	CURRENT_HOSTNAME=$(hostname)

	# Check if the hostname is the IP address
	if [ "$CURRENT_HOSTNAME" != "$PUBLIC_IP" ]; then

		# Set the hostname to the public IP address
		hostnamectl set-hostname "$PUBLIC_IP"

		# Update the /etc/hostname file
		echo "$PUBLIC_IP" > /etc/hostname

		# Update the /etc/hosts file
		sed -i "s/$CURRENT_HOSTNAME/$PUBLIC_IP/g" /etc/hosts

		# Set the NEEDS_RESTART variable to true
		NEEDS_RESTART=true

	fi

	# Set the desired PS1 value
	export PS1="\[\e[38;5;166m\]Ember VPN\[\e[0m\] \[\e[38;5;155m\][NODE]\[\e[0m\] \[\e[38;5;245m\](\[\e[0m\]$(hostname)\[\e[0m\]\[\e[38;5;245m\])\[\e[0m\] \[\e[38;5;203m\]🔥 \[\e[0m\]"

	# Update the /etc/profile.d/custom-prompt.sh script
	tee /etc/profile.d/custom-prompt.sh > /dev/null <<EOT
#!/bin/bash
export PS1="$PS1"
EOT

	# Set execute permissions for the script
	chmod +x /etc/profile.d/custom-prompt.sh

	# Remove any existing PS1 references in other files
	sed -i '/^PS1=.*/d' /etc/bash.bashrc
	sed -i '/^PS1=.*/d' /etc/skel/.bashrc
	sed -i '/^PS1=.*/d' ~/.bashrc

	# Source the custom-prompt.sh script in ~/.bashrc
	sed -i "/^source \/etc\/profile\.d\/custom-prompt\.sh$/d" ~/.bashrc	
	echo "source /etc/profile.d/custom-prompt.sh" | tee -a ~/.bashrc > /dev/null
	source ~/.bashrc

	touch ~/.hushlogin

	# Add scripts to the crontab
	crontab -r
	(crontab -l 2>/dev/null; echo "* * * * * /usr/bin/curl https://api.embervpn.org/ember/ping?hostname=$(/usr/bin/hostname) >/dev/null 2>&1") | crontab -

	echo -ne $GREEN"DONE\e[0m\n"

}

function sshall() {
	
	# Get IP addresses
	ips=$(curl -s "https://api.embervpn.org/ember/list-servers" | jq -r '.ips[]')

	while true; do
		echo -ne "\e[38;5;166mEmber VPN \e[38;5;045m[SWARM] \033[0m"
		read -p "🔥 " input
		
		if [[ "$input" == "exit" ]]; then
			break
		fi

		if [[ "$input" == $'\x0c' || "$input" == "clear" ]]; then
			clear
			continue
		fi
		
		ips_string=$(IFS=" "; echo "${ips[*]}")
		parallel-ssh -H "$ips_string" "$input"

	done

}

# Configure easy-rsa
function init_pki() {
	echo -ne "   "$GRAY"Initializing Easy RSA PKI... \e[0m"

	mkdir -p ~/easy-rsa ~/client-configs/keys
	ln -fs /usr/share/easy-rsa/* ~/easy-rsa/
	cd ~/easy-rsa
	chmod 700 ~/easy-rsa
	echo 'set_var EASYRSA_ALGO "ec"' > vars
	echo 'set_var EASYRSA_DIGEST "sha512"' >> vars
	./easyrsa --batch init-pki &> /dev/null || errorcheck

	echo -ne $GREEN"DONE\e[0m\n"

}

# Download certificates
function download_certs() {
	echo -ne "   "$GRAY"Downloading Ember VPN CA... \e[0m"

	if [[ $VERB = 1 ]]; then
		echo -e
		curl --request GET \
			--url https://api.embervpn.org/rsa/download-ca \
			> /usr/local/share/ca-certificates/ca.crt
		cp /usr/local/share/ca-certificates/ca.crt ~/client-configs/keys
		cp /usr/local/share/ca-certificates/ca.crt /etc/openvpn/server
		update-ca-certificates
	else
		curl -s --request GET \
			--url https://api.embervpn.org/rsa/download-ca \
			> /usr/local/share/ca-certificates/ca.crt
		cp /usr/local/share/ca-certificates/ca.crt ~/client-configs/keys &> /dev/null
		cp /usr/local/share/ca-certificates/ca.crt /etc/openvpn/server &> /dev/null
		update-ca-certificates &> /dev/null
	fi

	echo -ne $GREEN"DONE\e[0m\n"
}

# Download the CSR list
function download_csr() {

	echo -ne "   "$GRAY"Requesting server certificate... \e[0m"
	if [[ $VERB = 1 ]]; then
		echo -e
		./easyrsa --batch --req-cn="$NAME" gen-req $NAME nopass || errorcheck
		cp pki/private/$NAME.key /etc/openvpn/server/server.key || errorcheck
		SIGNED=$(curl --request POST \
			--url https://api.embervpn.org/rsa/sign-request \
			--header 'Content-Type: application/json' \
			--data '{"req": "'$(base64 -w0 pki/reqs/$NAME.req)'"}')
	else
		./easyrsa --batch --req-cn="$NAME" gen-req $NAME nopass &> /dev/null || errorcheck
		cp pki/private/$NAME.key /etc/openvpn/server/server.key &> /dev/null || errorcheck
		SIGNED=$(curl -s --request POST \
			--url https://api.embervpn.org/rsa/sign-request \
			--header 'Content-Type: application/json' \
			--data '{"req": "'$(base64 -w0 pki/reqs/$NAME.req)'"}')
	fi

	echo "$SIGNED" > /etc/openvpn/server/server.crt

	echo -ne $GREEN"DONE\e[0m\n"
}

# Initialiaze VPN key
function init_takey() {
	
	echo -ne "   "$GRAY"Initializing TLS-Auth key... \e[0m"
	if [[ $VERB = 1 ]]; then
		echo -e
		openvpn --genkey secret /etc/openvpn/server/ta.key || errorcheck
	else
		openvpn --genkey secret /etc/openvpn/server/ta.key &> /dev/null || errorcheck
		openvpn --genkey secret ta.key
	fi

	cp /etc/openvpn/server/ta.key ~/client-configs/keys
	echo -ne $GREEN"DONE\e[0m\n"

}

# Download server config
function download_conf() {
	echo -ne "   "$GRAY"Downloading server config... \e[0m"
	if [[ $VERB = 1 ]]; then
		echo -e
		POST=$(curl --request POST \
			--url https://api.embervpn.org/rsa/download-server-config \
			--header 'Content-Type: application/json' \
			--data '{
				"ipv4": "'$IP'",
				"ipv6": "'$IP6'",
				"iface": "'$IFACE'",
				"network": "'$NETWORK'",
				"subnet": "'$SUBNET'",
				"port": "'$PORT'",
				"proto": "'$PROTO'",
				"hostname": "'$NAME'"
			}' || errorcheck)
	else
		POST=$(curl -s --request POST \
			--url https://api.embervpn.org/rsa/download-server-config \
			--header 'Content-Type: application/json' \
			--data '{
				"ipv4": "'$IP'",
				"ipv6": "'$IP6'",
				"iface": "'$IFACE'",
				"network": "'$NETWORK'",
				"subnet": "'$SUBNET'",
				"port": "'$PORT'",
				"proto": "'$PROTO'",
				"hostname": "'$NAME'"
			}' || errorcheck)
	fi

	CA_PUB=$(echo $POST | jq -r '.ed25519')
	CONFIG=$(echo $POST | jq -r '.config' | base64 -w0 --decode)
	HASH=$(echo $POST | jq -r '.hash')

	# Add the CA's public key to the authorized keys
	sed -i '/ember_ca/d' ~/.ssh/authorized_keys || errorcheck
	echo $CA_PUB >> ~/.ssh/authorized_keys || errorcheck

	echo "$CONFIG" > /etc/openvpn/server/tcp.conf || errorcheck
	echo "$CONFIG" > /etc/openvpn/server/udp.conf || errorcheck

	# Replace {{ proto }} with the protocol in each config
	sed -i "s/{{ proto }}/tcp/g" /etc/openvpn/server/tcp.conf || errorcheck
	sed -i "s/{{ proto }}/udp/g" /etc/openvpn/server/udp.conf || errorcheck

	# And replace {{ port }} with the port in each config
	sed -i "s/{{ port }}/1190/g" /etc/openvpn/server/tcp.conf || errorcheck
	sed -i "s/{{ port }}/1191/g" /etc/openvpn/server/udp.conf || errorcheck

	echo -ne $GREEN"DONE\e[0m\n"


}

# Configure firewall
function conf_ufw() {
	echo -ne "   "$GRAY"Configuring Firewall... \e[0m"

	CIDR=$NETWORK$(awk -F. '{
		split($0, octets)
		for (i in octets) {
			mask += 8 - log(2**8 - octets[i])/log(2);
		}
		print "/" mask
	}' <<< $SUBNET)

	# Configure Firewall rules
	RULES=$(cat <<-END
		# START OPENVPN RULES
		*nat
		:POSTROUTING ACCEPT [0:0]
		-A POSTROUTING -s $CIDR -o $IFACE -j MASQUERADE
		COMMIT
		# END OPENVPN RULES
	END

	);


	if [[ $VERB = 1 ]]; then
		echo -e
		sed -i '/# START OPENVPN RULES/,/# END OPENVPN RULES/d' /etc/ufw/before.rules
		echo "$RULES" | cat - /etc/ufw/before.rules > temp && mv temp /etc/ufw/before.rules
		sed -i 's/DEFAULT_FORWARD_POLICY="DROP"/DEFAULT_FORWARD_POLICY="ACCEPT"/g' /etc/default/ufw
		
		
		sed -i 's/#net.ipv4.ip_forward=1/net.ipv4.ip_forward=1/g' /etc/sysctl.conf
		sysctl -p

		ufw allow $PORT/$PROTO
		ufw allow 22
		ufw disable && ufw --force enable
	else
		sed -i '/# START OPENVPN RULES/,/# END OPENVPN RULES/d' /etc/ufw/before.rules &> /dev/null
		echo "$RULES" | cat - /etc/ufw/before.rules > temp && mv temp /etc/ufw/before.rules &> /dev/null
		sed -i 's/DEFAULT_FORWARD_POLICY="DROP"/DEFAULT_FORWARD_POLICY="ACCEPT"/g' /etc/default/ufw &> /dev/null
		
		# Enable port forwarding in sysctl
		sed -i 's/#net.ipv4.ip_forward=1/net.ipv4.ip_forward=1/g' /etc/sysctl.conf &> /dev/null
		sysctl -p &> /dev/null

		ufw allow $PORT/$PROTO &> /dev/null
		ufw allow 22 &> /dev/null
		ufw disable &> /dev/null && ufw --force enable &> /dev/null
	fi

	echo -ne $GREEN"DONE\e[0m\n"
}

# Add openssh support
function openssh_support() {

	# Create VPN user
	useradd vpn -M -s /bin/false

	# Configure SSH user
	tee /etc/ssh/sshd_config.d/embervpn.conf > /dev/null <<EOT
PasswordAuthentication no
Match user vpn
	AllowTcpForwarding yes
	ForceCommand /bin/false
	PermitOpen localhost:1194
	MaxSessions 100000
EOT


	# Lock the vpn user account to disable password-based login
	if [[ $VERB = 1 ]]; then
		passwd -l vpn
	else
		passwd -ql vpn
	fi	

	# Restart ssh
	systemctl restart ssh

	# Create ssh folder
	mkdir -p /home/vpn/.ssh/

	# Hide login
	touch /home/vpn/.hushlogin

	# Create authorized keys file
	echo "" > /home/vpn/.ssh/authorized_keys

	# Set permissions
	chmod 700 /home/vpn/.ssh
	chmod 600 /home/vpn/.ssh/authorized_keys
	chown vpn:vpn -R /home/vpn

}

# Get command flags and args
while [ "$1" ]; do

	# if $1 starts with - or --, it's a flag
	if [[ $1 == -* ]]; then
		case $1 in
			-h|--help)
				help
				exit 0
				;;
			-v|--verbose)
				VERB=1
				echo -e "   "$GRAY"Verbose mode enabled\e[0m"
				;;
			*)
				echo -e "   "$RED"Error:\e[0m Unknown flag "$ORANGE"$1\e[0m. Try "$ORANGE"$0 --help\e[0m"
				exit 1
				;;
		esac
		shift
		continue
	fi

	# if $1 is a command, run it
	case $1 in
		install)
			shift
			install $@
			;;
		init-pki)
			shift
			init_pki $@
			;;
		update)
			shift
			wget https://api.embervpn.com/ember.sh
			chmod +x ember.sh
			mv ember.sh /usr/local/bin/ember
			;;
		ssh)
			shift
			sshall
			;;
		enroll)
			shift
			install
			openssh_support
			init_pki
			download_certs
			init_takey

			ARGUMENT_LIST=(
				"name"
				"iface"
				"ip"
				"port"
				"proto"
				"network"
				"subnet"
			)
			OPTS=$(getopt \
				--longoptions "$(printf "%s:," "${ARGUMENT_LIST[@]}")" \
				--name "$(basename "$0")" \
				--options "" \
				-- "$@"
			)
			eval set -- $OPTS

			# Initialize enroll variables
			NAME=$(hostname)
			IFACE=$(ip r | head -n 1 | awk '{print $5}')
			IP=$(curl http://checkip.dyndns.org/ 2> /dev/null | ruby -pe '$_=$_.scan(/\d+\.\d+\.\d+\.\d+/)' | jq -r '.[0]')
			IP6=$(curl -s http://ipv6.icanhazip.com)
			PORT="1194"
			PROTO="tcp"
			NETWORK="10.8.0.0"
			SUBNET="255.255.255.0"

			while [[ $# > 0 ]]; do
				case ${1} in
					--name)
						shift
						NAME=$1
						;;
					--iface)
						shift
						IFACE=$1
						;;
					--ip)
						shift
						IP=$1
						;;
					--port)
						shift
						PORT=$1
						;;
					--proto)
						shift
						PROTO=$1
						;;
					--network)
						shift
						NETWORK=$1
						;;
					--subnet)
						SUBNET=$2 && shift 2
						;;
					--)
						shift
						break
					;;
				esac
				shift
			done

			# Print variables
			echo -e "   "$GRAY"Enrolling with the following parameters:\e[0m"
			echo -e "   "$GRAY"Name:"$ORANGE" $NAME\e[0m"
			echo -e "   "$GRAY"Interface:"$ORANGE" $IFACE\e[0m"
			echo -e "   "$GRAY"IPv4:"$ORANGE" $IP\e[0m"
			echo -e "   "$GRAY"IPv6:"$ORANGE" $IP6\e[0m"
			echo -e "   "$GRAY"Port:"$ORANGE" $PORT\e[0m"
			echo -e "   "$GRAY"Protocol:"$ORANGE" $PROTO\e[0m"
			echo -e "   "$GRAY"Network:"$ORANGE" $NETWORK\e[0m"
			echo -e "   "$GRAY"Subnet:"$ORANGE" $SUBNET\e[0m"


			download_csr $NAME
			download_conf $NAME $IFACE $IP $PORT $PROTO $NETWORK $SUBNET
			conf_ufw $NETWORK $SUBNET $PROTO $PORT

			# Start openvpn
			if [[ $VERB = 1 ]]; then
				systemctl -f enable openvpn-server@tcp.service || errorcheck
				systemctl -f enable openvpn-server@udp.service || errorcheck
				systemctl start openvpn-server@tcp.service || errorcheck
				systemctl start openvpn-server@udp.service || errorcheck
			else
				systemctl -f enable openvpn-server@tcp.service &> /dev/null || errorcheck
				systemctl -f enable openvpn-server@udp.service &> /dev/null || errorcheck
				systemctl start openvpn-server@tcp.service &> /dev/null || errorcheck
				systemctl start openvpn-server@udp.service &> /dev/null || errorcheck
			fi

			# Create config generator
			mkdir -p ~/client-configs/files
			echo '#!/bin/bash' > ~/client-configs/make_config.sh;
			echo "KEY_DIR=~/client-configs/keys" >> ~/client-configs/make_config.sh;
			echo "OUTPUT_DIR=~/client-configs/files" >> ~/client-configs/make_config.sh;
			echo "BASE_CONFIG=~/client-configs/base.conf" >> ~/client-configs/make_config.sh;
			echo 'cat ${BASE_CONFIG} \' >> ~/client-configs/make_config.sh;
			echo '	<(echo -e "\n<ca>") \' >> ~/client-configs/make_config.sh;
			echo '	${KEY_DIR}/ca.crt \' >> ~/client-configs/make_config.sh;
			echo '	<(echo -e "\n</ca>\n<cert>") \' >> ~/client-configs/make_config.sh;
			echo '	${KEY_DIR}/${1}.crt \' >> ~/client-configs/make_config.sh;
			echo '	<(echo -e "\n</cert>\n<key>") \' >> ~/client-configs/make_config.sh; 
			echo '	${KEY_DIR}/${1}.key \' >> ~/client-configs/make_config.sh; 
			echo '	<(echo -e "</key>\n<tls-crypt>") \' >> ~/client-configs/make_config.sh; 
			echo '	${KEY_DIR}/ta.key \' >> ~/client-configs/make_config.sh; 
			echo '	<(echo -e "</tls-crypt>") \' >> ~/client-configs/make_config.sh;
			echo '	> ${OUTPUT_DIR}/${1}.ovpn' >> ~/client-configs/make_config.sh;
			chmod +x ~/client-configs/make_config.sh

			echo -e "\n   Server is convigured as:"$ORANGE" $HASH\e[0m"

			;;
		*)
			echo -e "   "$RED"Error:\e[0m Unknown command "$ORANGE"$1\e[0m. Try "$ORANGE"$0 --help\e[0m"
			exit 1
			;;
	esac

	echo -e

done

# If we need to restart
if [ "$NEEDS_RESTART" = true ]; then
	reboot
fi