import { Octokit } from "@octokit/rest";
import { Request, Response } from "express";

export const route = "ember/downloads";

const client = new Octokit({
	auth: process.env.GITHUB_TOKEN,
});

export default async function api(req: Request, res: Response): Promise<void | Response> {

	// list all files in repo EmberVPN/releases
	const win32 = await client.rest.repos.getContent({
		owner: "EmberVPN",
		repo: "releases",
		path: "win32"
	}).then(a => Array.from(a.data as RepoFile[])
		.map(({ name, download_url }) => ({
			name, download_url, version: name
				.split(/\W/)
				.map(a => parseInt(a))
				.filter(a => !isNaN(a)).join(".")
		})));

	interface RepoFile {
		name: string;
		download_url: string;
	}

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