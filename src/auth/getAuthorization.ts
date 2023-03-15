import { Request } from "express";

export default function getAuthorization(req: Request): string | undefined {
	if (req.header("authorization")) return req.header("authorization");
	if (typeof req.query.authorization === "string") return req.query.authorization;
	if (req.cookies.session_id) return req.cookies.session_id;
	return;
}
