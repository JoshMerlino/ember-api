import { Octokit } from "@octokit/rest";
import { Request, Response } from "express";

// Initialize GitHub API client
const client = new Octokit({ auth: process.env.GITHUB_PAT });

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
		.then(a => Array.from(a.data as RepoFile[])

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
			.map(file => ({
				name: file.name,
				sha: file.sha,
				version: v(file.name),
				download_url: `https://media.githubusercontent.com/media/EmberVPN/releases/master/${ platform }/${ file.name }`
			})))).then(a => a.reverse());
}

export const route = "ember/downloads";
export default async function api(req: Request, res: Response) {

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

	// Get all files for the latest version
	function getLatest(files: File[]) {

		// Get the latest file for each platform
		const latest = files[0];
		const { version } = latest;

		// Merge all files for the latest version
		const fx = files
			.filter(a => a.version === version)
			.map((a: Partial<File>) => delete a.version && a);

		return {
			version,
			files: fx.reverse()
		};

	}

	// Return the latest version for each platform
	res.json({
		success: true,
		platform: {
			win32: getLatest(win32),
			darwin: getLatest(darwin),
			linux: getLatest(linux)
		},

		// For compatability
		latest: {
			"__": "This is deprecated, use platform instead. The versions below are not the latest version.",
			win32: win32.reverse()[0],
			darwin: darwin.reverse()[0],
			linux: linux.reverse()[0]
		}

	});

}
