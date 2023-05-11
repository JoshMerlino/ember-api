import { Octokit } from "@octokit/rest";
import { Request, Response } from "express";
import rejectRequest from "../../src/util/rejectRequest";

// Initialize GitHub API client
const client = new Octokit({ auth: process.env.GITHUB_PAT });

export const route = "ember/download-client";
export default async function api(req: Request, res: Response) {

	// Get the latest release
	const { data: release } = await client.repos.getLatestRelease({
		owner: "EmberVPN",
		repo: "client",
	});

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

	// Return the latest version for each platform
	res.json({
		success: true,
		version,
		assets
	} satisfies REST.APIResponse<EmberAPI.ClientDownloads>);

}
