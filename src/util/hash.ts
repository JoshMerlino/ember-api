import { v5 } from "uuid";
import security from "./security.json";

export default function hash(password: string): string {
	return security.reduce((accumulator, _currentValue, index) => v5(accumulator, security[index]), password);
}
