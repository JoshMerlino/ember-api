import { Octokit } from "@octokit/rest";
import { Request, Response } from "express";
import rejectRequest from "../../../src/util/rejectRequest";

// Initialize GitHub API client
const client = new Octokit({ auth: process.env.GITHUB_PAT });

import cheerio from "cheerio";
import fetch from "node-fetch";

let ovpnversion: string | undefined;

async function getOpenvpn() {
	if (ovpnversion) return ovpnversion;

	// Fetch the page
	const data = await fetch("https://openvpn.net/community-downloads/")
		.then(res => res.text());
	
	// Parse the page
	const $ = cheerio.load(data);
	return ovpnversion = "v" + $("#heading-36753").text().trim().split("--").map(s => s.trim())[0].split(" ")[1];
}

export const route = [ "ember/download-client", "v2/ember/downloads" ];
export default async function api(req: Request, res: Response) {

	// Get the latest release
	const [ { data: release }, { data: all } ] = await Promise.all([
		client.repos.getLatestRelease({
			owner: "EmberVPN",
			repo: "client",
		}),
		client.repos.listReleases({
			owner: "EmberVPN",
			repo: "client"
		})
	]);

	// Get the version number
	const version = release.name;
	if (!version) return rejectRequest(res, 500, "No version number found");
	
	const assets = release.assets.map(asset => ({
		name: asset.name,
		downloadUrl: asset.browser_download_url,
		size: asset.size,
		downloadCount: asset.download_count,
		lastModified: new Date(asset.updated_at || asset.created_at).getTime() / 1e3,
		platform: asset.name.split(`${ version }_`)[1].split(".")[0]
	} satisfies Ember.Asset));

	const downloadCount = all.reduce((acc, release) => acc + release.assets.reduce((acc, asset) => acc + asset.download_count, 0), 0);

	// Return the latest version for each platform
	res.json({
		success: true,
		version,
		downloadCount,
		timestamp: new Date(release.published_at || release.assets[0].created_at).getTime() / 1e3,
		assets,
		openvpn: await getOpenvpn()
	});

}
