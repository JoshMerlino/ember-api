import cors from "cors";

// Export middleware
export default cors({
	allowedHeaders: [ "Content-Type", "Authorization", "Cookie" ]
});
