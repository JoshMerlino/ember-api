import { Request, Response } from "express";
import { access, readdir, rm, writeFile } from "fs/promises";
import mime from "mime-types";
import { mkdirp } from "mkdirp";
import path from "path";
import User from "../../src/auth/User";
import getAuthorization from "../../src/auth/getAuthorization";
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

		// Attempt to locate pfp
		const pfpDir = path.resolve(`./userdata/avatar/${ user.id }/`);
		const dir = await access(pfpDir)
			.then(() => true)
			.catch(() => false);

		// If the user has a custom pfp set
		if (dir) {
			const [ filename ] = await readdir(pfpDir);
			return res.sendFile(path.join(pfpDir, filename));
		}

		// Get default pfps
		const defaultPfps = await readdir(path.resolve("./default/avatar/"));

		// Get default avatar and send as response
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

			// Save the avatar
			await rm(path.resolve(`./userdata/avatar/${ user.id }/`), { recursive: true })
				.catch(() => null);
			await mkdirp(path.resolve(`./userdata/avatar/${ user.id }/`));
			await writeFile(path.resolve(`./userdata/avatar/${ user.id }/default.${ ext }`), file);

			// Send success
			return res.json({ success: true });

		});

		// Wait for the request to complete
		return;

	}

	// If user wants to reset their pfp
	if (req.method === "DELETE") {

		// Delete old pfp
		await rm(path.resolve(`./userdata/avatar/${ user.id }/`), { recursive: true })
			.catch(() => null);

		// Send success
		return res.json({ success: true });

	}

	// Reject since method is not allowed
	return rejectRequest(res, 405, `Method '${ req.method }' not allowed.`);

}
