import { Web3Storage } from "web3.storage";
const token = process.env.WEBSTORE || "";

export const storage = new Web3Storage({ token });