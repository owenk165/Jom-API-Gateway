# Jom-API-Gateway
API Gateway server for *'Jom'* -- an URL shortening site. The server performs database transaction with **Riak KV** database hosted locally.

<h2>Pre-requisites</h2>

1. Have NodeJS installed in your machine. Install NodeJS from https://nodejs.org/en/download/ .
  
2. (Windows) Install Docker. Install docker from https://docs.docker.com/docker-for-windows/install/ .

<h2>Docker set-up</h2>

1. Create 2 volumes named: riakkv-db & riakkv-db-log. The volume will be used to save Riak KV data from docker.
	```
	docker volume create riakkv-db 
	docker volume create riakkv-db-log
	```
  
2. Create a new directory. Add a 'riak.conf' file with the following code inside. Ensure that the file ends in newline to avoid Riak from concatenating new configuration on the same line.
   ```
   storage_backend = leveldb
   
   ```
  
  
3. Start the Riak KV cluster and initial node by running the image/container with the specific volume through admin powershell:
   <br/> cd to the directory of conf file.
   ```
   docker run --name=riak -d -p 0.0.0.0:8087:8087 -p 0.0.0.0:8098:8098 --label cluster.name=adhoc -v riakkv-db:/var/lib/riak -v riakkv-db-log:/var/log/riak -v $PWD/riak.conf:/etc/riak/riak.conf basho/riak-kv
   ```
   The node will be listening at port 8087 and 8089.
   
5. Optional: Add additional nodes. <br />
   Get the container ip address:
   ```
   docker inspect -f '{{.NetworkSettings.IPAddress}}' riak
   ```
   Change `primary_node_address` to the address of first node's docker container. Run the command in cmd/shell:
   ```
   docker run --name=riak-node2 -d -P -e COORDINATOR_NODE=primary_node_address --label cluster.name=adhoc -v riakkv-db2:/var/lib/riak -v riakkv-db-log2:/var/log/riak basho/riak-kv
   ```
5. Access Docker admin page for information:
	`http://localhost:8098/admin/`
  
6. Check riak kv cluster status via cmd:
   ```
   docker exec -it container_address riak-admin cluster status
   ```
  
<h2>Running the server</h2>

1. Fork the repository and clone the repository in a new directory.

2. Run `npm install` to install dependencies.

3. Run `npm run start` to start the server.
  
