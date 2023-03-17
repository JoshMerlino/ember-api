import { Request, Response } from "express";
import { readFile, unlink } from "fs/promises";
import { resolve } from "path";

export const route = "rsa/download-server-config";

export default async function api(req: Request, res: Response): Promise<any> {

	const hash = req.query.hash ?? req.body.hash;

	// read config
	try {

		const config = await readFile(resolve(`./userdata/.tmp.${ hash }.conf`), "utf8");
		
		// send config
		res.setHeader("Content-Type", "text/plain");
		res.setHeader("Content-Disposition", `attachment; filename=${ hash }.conf`);
		res.send(config);
		
		// Destroy file
		await unlink(resolve(`./userdata/.tmp.${ hash }.conf`));
	
	} catch (e) {
		res.status(404).json({
			success: false,
			error: "404 Not Found",
			message: "Config not found"
		});
	}
	
}