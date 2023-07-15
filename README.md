# Ember VPN API Controller
This is the API controller for the Ember VPN project.

## Install Ember CLI
```bash
wget https://api.embervpn.com/ember.sh
chmod +x ember.sh
mv ember.sh /usr/local/bin/ember
```

## Enroll a server
```bash
ember enroll
```

Optional CLI parameters:
* `--name`: The name of the server. (default: hostname)
* `--ip`: The IP address of the server. (default: public IPv4 address)
* `--iface`: The network interface to bind OpenVPN to. (default: first non-loopback interface)
* `--port`: The port to bind OpenVPN to. (default: 1194)
* `--network`: The network to use for the VPN. (default: 10.8.0.0)
* `--subnet`: The netmask to use for the VPN. (default: 255.255.255.0)