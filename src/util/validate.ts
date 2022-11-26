export function emailAddress(email: string): boolean {
	return email.match(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/) !== null;
}

export function userID(id: string): boolean {
	if (id === undefined) return false;
	if (isNaN(parseInt(id))) return false;
	if (parseInt(id) < 0) return false;
	return true;
}
