import { Request, Response } from "express";
import { readdir } from "fs/promises";
import mime from "mime-types";
import path from "path";
import { File, Web3File } from "web3.storage";
import User from "../../src/auth/User";
import getAuthorization from "../../src/auth/getAuthorization";
import { sql } from "../../src/mysql";
import { storage } from "../../src/storage";
import rejectRequest from "../../src/util/rejectRequest";
import { userID } from "../../src/util/validate";

export const route = [ "auth/avatar", "auth/avatar/:id" ];
export default async function api(req: Request, res: Response) {

	// Get request body
	const body = { ...req.body, ...req.query, ...req.params };

	// If the request is to get a pfp
	if (req.method === "GET") {

		// Get requested user id
		const { id } = body;
		if (!userID(id)) return rejectRequest(res, 400, `Invalid user ID '${ id }'.`);

		// Make sure user exists
		const user = await User.fromID(parseInt(id.toString()));
		if (!user) return rejectRequest(res, 404, `User with ID '${ id }' not found.`);

		// Get the user's pfp from ipfs
		if (user.avatar) {

			// Get the avatar
			const avatar = await storage.get(user.avatar);
			if (!avatar) return rejectRequest(res, 500, `Failed to get avatar for user '${ id }'.`);
			
			// Get the file
			const [ _file ] = await avatar.files();
			const file = _file as Web3File & { _name: string };
			if (!file || !file._name) return rejectRequest(res, 500, `Failed to get avatar for user '${ id }'.`);
			
			res.redirect(`https://${ user.avatar }.ipfs.w3s.link/${ file._name }`);
			return;
  
		}

		// Get default pfps
		const defaultPfps = await readdir(path.resolve("./default/avatar/"));
		const defaultPath = path.resolve(`./default/avatar/${ defaultPfps[user.id % defaultPfps.length] }`);
		return res.sendFile(defaultPath);

	}

	// Ensure authorization
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!authorization || !user) return rejectRequest(res, 401);

	// If the request is to set a pfp
	if (req.method === "PUT") {

		// Get content type
		const TYPE = req.header("content-type") || "unknown/";

		// Upload the new avatar
		const data = [ Buffer.alloc(0) ];
		req.on("data", chunk => data.push(chunk));

		// On request complete
		req.on("end", async function() {

			// Get file & extension
			const file = Buffer.concat(data);
			const ext = mime.extension(TYPE);

			// Make sure the file is an image
			if (TYPE.split("/")[0] !== "image" || !ext) return rejectRequest(res, 415, `Unsupported Media Type '${ TYPE }'.`);

			// Make sure the file is not too large
			if (Buffer.byteLength(file) > 2 ** 20 * 5) return rejectRequest(res, 413, "Uploaded file exceeds limit of 5 mb.");
			
			// Convert buffer to filelike
			// const filelike: Filelike = {
			// 	name: `${ user.id }/default.${ ext }`,
			// 	stream: () => new ReadableStream({
			// 		start(controller) {
			// 			controller.enqueue(file);
			// 			controller.close();
			// 		}
			// 	})
			// };

			// Upload the file
			const asFile = new File([ file ], `${ user.id }/default.${ ext }`, { type: TYPE });
			const cid = await storage.put([ asFile ]);
			
			// Save the cid
			await sql.unsafe("UPDATE users SET avatar = $1 WHERE id = $2;", [ cid, user.id ]);

			// Send success
			return res.json({ success: true });

		});

		// Wait for the request to complete
		return;

	}

	// If user wants to reset their pfp
	if (req.method === "DELETE") {

		// Remove the user's pfp from the database
		await sql.unsafe("UPDATE users SET avatar = NULL WHERE id = $1;", [ user.id ]);

		// Send success
		return res.json({ success: true });

	}

	// Reject since method is not allowed
	return rejectRequest(res, 405, `Method '${ req.method }' not allowed.`);

}
