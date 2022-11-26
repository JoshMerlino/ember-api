import UUID from "uuid-int";

const generator = UUID(0);

export default function snowflake(): number {
	return generator.uuid();
}
