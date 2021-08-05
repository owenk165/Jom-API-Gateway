import Riak from "basho-riak-client/lib/client";
var crypto = require("crypto");

var RiakClient = require("basho-riak-client").Client;

// Specify ports of riak database nodes
var riakNodes = ['localhost:8087'];

export default async function createClientConnection() {
    return new Promise((resolve, reject) => {
        var riakClient = new RiakClient(riakNodes, (error, client) => {
            console.log('has error? -> ', error)
            if (error) {
                console.log('error indeed');
                error.hasError = true;
                reject(error);
                // throw new Error(error);
            } else {
                console.log("[+] Connection has been established with Riak nodes at: ", riakNodes);

                riakClient.ping((error) => {
                    if (error) {
                        reject("[riakClient.ping()] Error in connecting to database");
                        // throw new Error(error);
                    } else {
                        console.log("[+] Ping is successful");
                        resolve(riakClient);
                    }
                });
            }
        })
    });
}

export const endClientConnection = (riakClient) => {
    riakClient.stop((error) => {
        if (error) {
            console.error(error);
        } else {
            console.log("[!] Connection has been closed");
        }
    });
}