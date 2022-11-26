# auth-server

```yaml
version: '3.8'

volumes: 
  mysql: {}
  userdata: {}
  default: {}

services:

  auth-server:
    image: jmer05/auth-server
    environment:
      - MYSQL_HOST=mysql
      - MYSQL_USER=root
      - MYSQL_PASS=
      - MYSQL_DATA=auth
    depends_on:
      - mysql
    volumes:
      - userdata:/app/userdata
      - default:/app/default,readonly

  mysql:
    image: mysql:5.7
    environment:
      - MYSQL_ROOT_PASSWORD=secret
      - MYSQL_DATABASE=auth
      - MYSQL_USER=auth
      - MYSQL_PASSWORD=secret
    volumes:
      - mysql:/var/lib/mysql
```