export type LogFields = Record<string, unknown>;

export interface Logger {
  info: (event: string, fields?: LogFields) => void;
  error: (event: string, fields?: LogFields) => void;
}

export const logger: Logger = {
  info(event, fields = {}) {
    write('info', event, fields);
  },
  error(event, fields = {}) {
    write('error', event, fields);
  },
};

function write(level: 'info' | 'error', event: string, fields: LogFields): void {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: 'paqui-mcp',
    event,
    ...fields,
  });

  if (level === 'error') {
    console.error(entry);
  }
  else {
    console.log(entry);
  }
}
