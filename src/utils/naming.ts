export function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

export function toPascalCase(value: string): string {
  return value
    .replace(/[_\s-]+(.)?/g, (_, char: string | undefined) =>
      char ? char.toUpperCase() : '',
    )
    .replace(/^(.)/, (char) => char.toUpperCase());
}

export function junctionEntityName(source: string, target: string): string {
  return `${toPascalCase(source)}${toPascalCase(target)}`;
}

export function junctionFieldName(entityName: string): string {
  return `${toSnakeCase(entityName)}Id`;
}
