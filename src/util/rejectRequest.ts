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

	case 406:
		return res.json({
			success: false,
			message: "406 Not Acceptable",
			description: "The requested resource rejected the specified request data.",
			readable
		});

	case 409:
		return res.json({
			success: false,
			message: "409 Conflict",
			description: "The request could not be completed due to a conflict with the current state of the resource.",
			readable
		});

	case 413:
		return res.json({
			success: false,
			message: "413 Payload Too Large",
			description: "The request entity is larger than the server is willing or able to process.",
			readable
		});
		
	case 415:
		return res.json({
			success: false,
			message: "415 Unsupported Media Type",
			description: "The request entity has a media type which the server or resource does not support.",
			readable
		});
			
	case 429:
		return res.json({
			success: false,
			message: "429 Too Many Requests",
			description: "You have sent too many requests in a given amount of time.",
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