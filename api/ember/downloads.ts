import { Octokit } from "@octokit/rest";
import { Request, Response } from "express";

export const route = "ember/downloads";

const client = new Octokit({
	auth: process.env.GITHUB_PAT
});

// Helper function to get all files in a directory
async function getDownloads(platform: string) {

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

	return Promise.all(await client.rest.repos.getContent({
		owner: "EmberVPN",
		repo: "releases",
		path: platform
	}).catch(() => ({ data: []}))
		.then(async a => Array.from(a.data as RepoFile[])

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
				download_url: `https://media.githubusercontent.com/media/EmberVPN/releases/master/${ platform }/${ file.name }`
			})))).then(a => a.reverse());
}

export default async function api(req: Request, res: Response): Promise<void | Response> {

	// List all files in repo EmberVPN/releases
	const win32 = await getDownloads("win32");
	const linux = await getDownloads("linux");
	const darwin = await getDownloads("darwin");

	interface File {
		name: string;
		sha: string;
		version: string;
		download_url: string;
	}

	function dx(files: File[]) {

		// Get the latest file for each platform
		const latest = files[0];
		const { version } = latest;

		const fx = files.filter(a => a.version === version)
			.map((a: Partial<File>) => delete a.version && a);

		return {
			version,
			files: fx.reverse()
		};

	}

	res.json({
		success: true,
		platform: {
			win32: dx(win32),
			darwin: dx(darwin),
			linux: dx(linux),
		}
	});

}
