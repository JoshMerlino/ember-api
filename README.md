# auth-server

## Environment
```
MYSQL_HOST  = ...
MYSQL_USER  = ...
MYSQL_PASS  = ...
MYSQL_DATA  = ...

SMTP_USER   = ...
SMTP_PASS   = ...
```

## Docker Compose
```yaml
version: '3.7'

volumes: 
  mysql: {}
  userdata: {}
  default: {}

services:

  db:
    image: mariadb
    restart: unless-stopped
    environment:
      MYSQL_DATABASE: auth-server
      MYSQL_USER: auth-server
      MYSQL_PASSWORD: ${DB_PASSWORD}
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
    volumes:
      - mysql:/var/lib/mysql

  phpmyadmin:
    image: phpmyadmin
    restart: unless-stopped
    ports:
      - 9400:80
    links:
      - db
    environment:
      PMA_USER: auth-server
      PMA_PASSWORD: ${DB_PASSWORD}
      
  auth-server:
    image: jmer05/auth-server
    restart: unless-stopped
    ports:
      - 9433:80
    links:
      - db
    environment:
      MYSQL_HOST: tasks.db
      MYSQL_USER: auth-server
      MYSQL_DATA: auth-server
      MYSQL_PASS: ${DB_PASSWORD}
    volumes:
      - userdata:/app/userdata
      - default:/app/default:ro
    deploy:
      mode: global
```