import { Octokit } from "@octokit/rest";
import { Request, Response } from "express";

export const route = "ember/downloads";

const client = new Octokit({
	auth: process.env.GITHUB_PAT
});

export default async function api(req: Request, res: Response): Promise<void | Response> {

	interface RepoFile {
		name: string;
		download_url: string;
		sha: string;
	}

	// Get version from file name
	const v = (name: string) => name
		.split(/\W/)
		.map(a => parseInt(a))
		.filter(a => !isNaN(a))
		.join(".");

	// List all files in repo EmberVPN/releases
	const win32 = await Promise.all(await client.rest.repos.getContent({
		owner: "EmberVPN",
		repo: "releases",
		path: "win32"
	}).then(async a => Array.from(a.data as RepoFile[])

		// Sort by version
		.sort((a, b) => {
			const aVersion = v(a.name);
			const bVersion = v(b.name);
			if (aVersion === bVersion) return 0;
			const aParts = aVersion.split(".");
			const bParts = bVersion.split(".");
			for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
				const aPart = parseInt(aParts[i]);
				const bPart = parseInt(bParts[i]);
				if (aPart === bPart) continue;
				return aPart > bPart ? 1 : -1;
			}
			return 0;
		})

		// Map to file info
		.map(async file => ({
			name: file.name,
			sha: file.sha,
			version: v(file.name),
			download_url: `https://media.githubusercontent.com/media/EmberVPN/releases/master/win32/${ file.name }`
		}))));

	res.json({
		success: true,
		latest: {
			win32: win32.reverse()[0]
		},
		older: {
			win32: win32.slice(1)
		}
	});

}
