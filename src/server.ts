import asyncRequireContext from "async-require-context";
import chalk from "chalk";
import { Application, Express, RequestHandler } from "express";
import { readFileSync } from "fs";
import http from "http";
import { resolve } from "path";

export default async function server(app: Express): Promise<void> {

	// Apply all middlewares
	const middlewares = await asyncRequireContext<Middleware>("./lib/src/middleware").catch(() => []);
	middlewares.map(middleware => {
		app.use(<RequestHandler><unknown>middleware.module.default);
		console.info(chalk.magenta("MDW"), "Added middleware from", chalk.cyan(middleware.path));
	});

	// Apply all runtimes
	const runtimes = await asyncRequireContext<Runtime>("./lib/src/runtime").catch(() => []);
	runtimes.map(runtime => {
		runtime.module.default(app);
		console.info(chalk.yellow("RNT"), "Added runtime from", chalk.cyan(runtime.path));
	});

	// Get all API endpoints and add them to the app context.
	const endpoints = await asyncRequireContext<Endpoint>("./lib/api").catch(() => []);
	endpoints.map(function(endpoint) {
		const routes = typeof endpoint.module.route === "string" ? [ endpoint.module.route ] : endpoint.module.route;
		routes.map(route => app.all(`/api/${route}`, <Application><unknown>endpoint.module.default));
		routes.map(route => app.all(`/${route}`, <Application><unknown>endpoint.module.default));
		console.info(chalk.greenBright("EDP"), "Added API endpoints from", chalk.cyan(endpoint.path));
	});

	// Get port to listen on (HTTP)
	const PORT = process.env.PORT || 80;

	// Start HTTP server
	http.createServer(app).listen(PORT);
	console.info(chalk.redBright("SRV"), "HTTP server running on", chalk.cyan(`:${PORT} (http)`));

}
