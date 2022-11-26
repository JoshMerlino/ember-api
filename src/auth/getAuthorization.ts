import { Request } from "express";

export default function getAuthorization(req: Request): string | undefined {
	if (req.header("authorization")) return req.header("authorization");
	if (req.cookies.session_id) return req.cookies.session_id;
	return;
}
