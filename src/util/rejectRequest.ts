import { Response } from "express";

export default function rejectRequest(res: Response, errorCode = 500, readable?: string) {

	res.status(errorCode);
	switch (errorCode) {

	default:
		return res.json({
			success: false,
			message: `${ errorCode } Unknown Error`,
			description: "An error occurred while processing the request.",
			readable
		});

	case 400:
		return res.json({
			success: false,
			message: "400 Bad Request",
			description: "The request was malformed.",
			readable
		});

	case 401:
		return res.json({
			success: false,
			message: "401 Unauthorized",
			description: "You are not logged in.",
			readable
		});

	case 403:
		return res.json({
			success: false,
			message: "403 Forbidden",
			description: "You are not allowed to access this resource.",
			readable
		});

	case 404:
		return res.json({
			success: false,
			message: "404 Not Found",
			description: "The requested resource could not be found.",
			readable
		});

	case 405:
		return res.json({
			success: false,
			message: "405 Method Not Allowed",
			description: "The requested resource does not support the specified HTTP method.",
			readable
		});

	case 500:
		return res.json({
			success: false,
			message: "500 Internal Server Error",
			description: "An error occurred while processing the request.",
			readable
		});

	}
}