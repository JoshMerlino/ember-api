import asyncRequireContext from "async-require-context";
import chalk from "chalk";
import { Express, RequestHandler } from "express";
import http from "http";

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
		function apply(route: string, handler: RequestHandler) {
			app.all(`/api/${ route }`, handler);
			app.all(`/${ route }`, handler);
		}
		routes.map(route => apply(route, (a, b) => {
			try {
				endpoint.module.default(a, b);
			} catch (e) {
				console.error(e);
				b.status(500).json({
					success: false,
					error: "500 Internal Server Error",
					description: "An internal server error occurred.",
					message: process.env.DEVELOPMENT ? e : "[Redacted]"
				});
			}
		}));
		console.info(chalk.greenBright("EDP"), "Added API endpoints from", chalk.cyan(endpoint.path));
	});

	// Get port to listen on (HTTP)
	const PORT = process.env.PORT || 80;

	// Start HTTP server
	http.createServer(app).listen(PORT);
	console.info(chalk.redBright("SRV"), "HTTP server running on", chalk.cyan(`:${ PORT } (http)`));

}
