import cors from "cors";

// Export middleware
export default cors({
	origin: "*",
	methods: [ "GET", "POST", "PUT", "DELETE", "PATCH" ],
	credentials: true,
	preflightContinue: true
});
