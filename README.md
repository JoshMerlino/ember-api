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
      - MYSQL_DATA=auth
      - MYSQL_USER=auth
      - MYSQL_PASS=secret
    depends_on:
      - mysql
    volumes:
      - userdata:/app/userdata
      - default:/app/default,readonly
  ...
```