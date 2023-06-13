import { Octokit } from "@octokit/rest";
import cheerio from "cheerio";
import { Request, Response } from "express";
import fetch from "node-fetch";

// Initialize GitHub API client
const client = new Octokit({ auth: process.env.GITHUB_PAT });

export const route = "v3/ember/downloads";
export default async function api(req: Request, res: Response) {
	
	// Hold request until cache is ready
	if (!cache.__isReady) {
		fetcher();
		setTimeout(() => api(req, res), 10);
		return;
	}

	// Send the cached data
	res.json({
		success: true,
		...{
			...cache,
			__isReady: undefined,
			__isFetching: undefined
		}
	});

}

// Cache the data
const cache = {
	__isReady: false,
	__isFetching: false,

	totalDownloads: -1,
	timestamp: -1,
	latest: "",
	assets: {} as Record<string, Ember.Asset[]>,
	dependencies: {} as Record<string, {
		latest: string;
		assets: Record<string, string[]>;
	}>
};

// Fetch the data every 60 seconds
setInterval(fetcher, 60000);
async function fetcher() {

	// Don't fetch if we're already fetching & set the fetching flag if we are
	if (cache.__isFetching) return;
	cache.__isFetching = true;

	// Fetch all the data we need in parallel
	const [ embervpn, openvpn, openssh ] = await Promise.all([
		
		// Get all releases 
		client.repos.listReleases({
			owner: "EmberVPN",
			repo: "client"
		}).then(res => res.data),

		// Get the latest OpenVPN version
		client.repos.listTags({
			owner: "OpenVPN",
			repo: "openvpn"
		}).then(async({ data }) => ({
			latest: data[0].name,
			assets: {
				win32: (await async function() {
					const builds: string[] = [];
					const html = await fetch("https://build.openvpn.net/downloads/releases/")
						.then(res => res.text());
					const $ = cheerio.load(html);
					$("pre")
						.children()
						.each(function() {
							if (!$(this).text().includes(data[0].name.substring(1))) return;
							if (!$(this).text().endsWith(".msi")) return;
							builds.push(`https://build.openvpn.net/downloads/releases/${ $(this).attr("href") }`);
						});
					return builds;
				}())
			}
		})),

		// Get the latest OpenSSH version
		client.repos.getLatestRelease({
			owner: "PowerShell",
			repo: "Win32-OpenSSH"
		}).then(async({ data }) => ({
			latest: data.name || "",
			assets: {
				win32: (await async function() {
					const builds: string[] = [];
					data.assets.filter(asset => asset.name.endsWith(".msi"))
						.forEach(asset => builds.push(asset.browser_download_url));
					return builds;
				}())
			}
		}))

	]);

	// Get the total download count & release time
	cache.totalDownloads = embervpn.reduce((acc, release) => acc + release.assets.reduce((acc, asset) => acc + asset.download_count, 0), 0);
	cache.timestamp = new Date(embervpn[0].published_at || embervpn[0].assets[0].created_at).getTime() / 1e3;

	// Get the latest from the releases
	const [ latest ] = embervpn;
	cache.latest = latest.name || latest.tag_name;

	// Get assets
	latest.assets.map(asset => ({
		name: asset.name,
		downloadUrl: asset.browser_download_url,
		size: asset.size,
		downloadCount: asset.download_count,
		lastModified: new Date(asset.updated_at || asset.created_at).getTime() / 1e3,
		platform: asset.name.split(`${ cache.latest }_`)[1].split(".")[0]
	} satisfies Ember.Asset)).forEach(asset => {
		if (!cache.assets[asset.platform]) cache.assets[asset.platform] = [];
		cache.assets[asset.platform].push(asset);
	});

	// Get the OpenVPN version
	cache.dependencies.openvpn = openvpn;

	// Get the OpenSSH version
	cache.dependencies.openssh = openssh;

	// Mark the cache as ready
	cache.__isReady = true;
	cache.__isFetching = false;

}