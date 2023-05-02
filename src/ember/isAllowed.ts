import User from "../auth/User";

export async function isAllowed(server: Ember.Server, _user: User): Promise<false | Ember.Server> {
	return server;

	// const accessMap: Record<string, string[]> = JSON.parse(await readFile(resolve("./userdata/accessMap.json"), "utf8"));
	// if (accessMap[user.id]?.includes(server.hash)) return server;
	// if (accessMap[user.id]?.includes(server.ip)) return server;
	// if (accessMap[user.id]?.includes(server.hash)) return server;
	// if (accessMap[user.id]?.includes("*")) return server;
	// return false;
}
