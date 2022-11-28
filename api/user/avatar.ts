/* eslint @typescript-eslint/no-explicit-any: off */
/* eslint camelcase: off */
import { Request, Response } from "express";
import { access, readdir, rm, writeFile } from "fs/promises";
import mime from "mime-types";
import mkdirp from "mkdirp";
import path from "path";
import getAuthorization from "../../src/auth/getAuthorization";
import User from "../../src/auth/User";
import * as validate from "../../src/util/validate";

export const route = [
	"v1/user/avatar",
	"v1/user/avatar/:userid"
];

// Function to save the pfp to disk
export async function savePfp(type: string, content: string | Buffer, id: number): Promise<boolean> {
	if (Buffer.byteLength(content) > 2 ** 20 * 5) return false;
	try {
		await rm(path.resolve(`./userdata/avatar/${id}/`), { recursive: true });
	} catch (e) {
		void e;
	}
	await mkdirp(path.resolve(`./userdata/avatar/${id}/`));
	await writeFile(path.resolve(`./userdata/avatar/${id}/default.${type}`), content);
	return true;
}

export default async function api(req: Request, res: Response): Promise<any> {

	const body = { ...req.body, ...req.query, ...req.params };

	// If user is GETTING
	if (req.method === "GET") {

		// Get requested userid
		const { userid } = body;
		if (!validate.userID(userid)) return res.status(406).json({
			success: false,
			error: "406 Not Acceptable",
			description: "No user ID was specified."
		});

		// Make sure user exists
		const user = await User.fromID(parseInt(userid.toString()));
		if (!user) return res.status(406).json({
			success: false,
			error: "406 Not Acceptable",
			description: `No user with ID '${userid}' exists.`
		});

		// Attempt to locate pfp
		const pfpDir = path.resolve(`./userdata/avatar/${user.id}/`);
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
		const defaultPath = path.resolve(`./default/avatar/${defaultPfps[user.id % defaultPfps.length]}`);
		return res.sendFile(defaultPath);

	}

	// Verify authorization
	const authorization = getAuthorization(req);
	if (authorization === undefined) return res.status(401).json({
		success: false,
		error: "401 Unauthorized",
		description: "You likley do not have a valid session token."
	});

	// Get user and 2fa status
	const user = await User.fromAuthorization(authorization);
	if (!user) return res.status(401).json({
		success: false,
		error: "401 Unauthorized",
		description: "You likley do not have a valid session token."
	});

	// If user wants to PUT new pfp
	if (req.method === "PUT") {

		// Get content type
		const TYPE = req.header("content-type") || "unknown/";

		// Get data
		const data = [ Buffer.alloc(0) ];
		req.on("data", (chunk: Buffer) => data.push(chunk));

		// On request complete
		req.on("end", async function() {

			// Get extension
		   	const ext = mime.extension(TYPE);

		   	if (TYPE.split("/")[0] !== "image" || !ext) return res.status(415).json({
				success: false,
				error: "415 Unsupported Media Type",
				description: "Uploaded file is not of 'image/*' type."
			});

			// Try to save the avatar
		   	const didSave = await savePfp(ext, Buffer.concat(data), user!.id);

			// If it failed to save
		   	if (!didSave) return res.status(413).json({
				success: false,
				error: "413 Payload Too Large",
				description: "Uploaded file exceeds limit of 5 mb."
			});

		  	return res.json({ success: true });

		});

		return;

	}

	// If user wants to DELETE pfp
	if (req.method === "DELETE") {

		// Delete old pfp
		await rm(path.resolve(`./userdata/avatar/${user!.id}/`), { recursive: true });

		// Send success
		return res.json({ success: true });

	}

	// Continue?
	if (res.headersSent) return;

	return res.status(405).json({
		success: false,
		message: "405 Method Not Allowed",
		description: `Method '${req.method}' is not allowed on this endpoint.`
	});

}
