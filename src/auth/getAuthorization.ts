import { Request } from "express";

// Gets the authorization/session_id from the request
export default function getAuthorization(req: Request): string | undefined {
	if (req.header("authorization")) return req.header("authorization");
	if (req.header("session_id")) return req.header("session_id");
	if (typeof req.query.authorization === "string") return req.query.authorization;
	if (typeof req.query.session_id === "string") return req.query.session_id;
	if (req.cookies.authorization) return req.cookies.authorization;
	if (req.cookies.session_id) return req.cookies.session_id;
	return;
}
