import { Octokit } from "@octokit/rest";
import { Request, Response } from "express";

export const route = "ember/downloads";

const client = new Octokit({
	auth: process.env.GITHUB_PAT,
});

export default async function api(req: Request, res: Response): Promise<void | Response> {

	// list all files in repo EmberVPN/releases
	const win32 = await client.rest.repos.getContent({
		owner: "EmberVPN",
		repo: "releases",
		path: "win32"
	}).then(a => Array.from(a.data as RepoFile[])
		.map(({ name }) => {
			const version = name
				.split(/\W/)
				.map(a => parseInt(a))
				.filter(a => !isNaN(a))
				.join(".");
			return {
				name,
				download_url: `https://media.githubusercontent.com/media/EmberVPN/releases/master/win32/embervpn-client-${ version }-win32-setup.exe`,
				version
			};
		}));

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