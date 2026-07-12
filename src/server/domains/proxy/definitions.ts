import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { tool } from '@server/registry/tool-builder';

export const PROXY_TOOLS: Tool[] = [
  tool('proxy_start', (t) =>
    t
      .desc('Start the local HTTP/HTTPS interception proxy with optional TLS.')
      .number('port', 'Listen port.', { default: 8080 })
      .boolean('useHttps', 'Enable HTTPS interception.', {
        default: true,
      }),
  ),
  tool('proxy_stop', (t) => t.desc('Stop the proxy and release all active rules.').destructive()),
  tool('proxy_status', (t) =>
    t.desc('Report proxy status, listen port, and CA certificate path.').query(),
  ),
  tool('proxy_export_ca', (t) => t.desc('Read the proxy CA certificate.').query()),
  tool('proxy_add_rule', (t) =>
    t
      .desc('Add an interception rule: forward, mock response, or block.')
      .string('action', 'Rule action: forward, mock_response, or block.')
      .string('method', 'HTTP method to match. Use ANY, ALL, or * to match every method.', {
        default: 'GET',
      })
      .string('urlPattern', 'URL matcher string or regex literal.')
      .number('mockStatus', 'Response status for mock_response.', { default: 200 })
      .string('mockBody', 'Response body for mock_response.')
      .object(
        'forwardOptions',
        {
          transformRequest: {
            type: 'object',
            description:
              'Optional request rewrite applied on passthrough. Mutually exclusive with callback mode (not exposed).',
            properties: {
              replaceMethod: { type: 'string', description: 'Replacement HTTP method.' },
              updateHeaders: {
                type: 'object',
                description: 'Headers merged into the request; a null value removes the header.',
                additionalProperties: { type: ['string', 'null'] },
              },
              replaceHeaders: {
                type: 'object',
                description: 'Headers that completely replace the request headers.',
                additionalProperties: { type: 'string' },
              },
              replaceBody: {
                type: 'string',
                description: 'String that replaces the request body entirely.',
              },
            },
          },
          transformResponse: {
            type: 'object',
            description: 'Optional response rewrite applied on passthrough.',
            properties: {
              replaceStatus: {
                type: 'integer',
                minimum: 100,
                maximum: 599,
                description: 'Replacement response status code (100-599).',
              },
              updateHeaders: {
                type: 'object',
                description: 'Headers merged into the response; a null value removes the header.',
                additionalProperties: { type: ['string', 'null'] },
              },
              replaceHeaders: {
                type: 'object',
                description: 'Headers that completely replace the response headers.',
                additionalProperties: { type: 'string' },
              },
              replaceBody: {
                type: 'string',
                description: 'String that replaces the response body entirely.',
              },
            },
          },
        },
        'Forward-only rewrite options. Only honored when action=forward; ignored otherwise. Omit for plain passthrough.',
      )
      .required('action'),
  ),
  tool('proxy_list_rules', (t) =>
    t.desc('List active proxy interception rules tracked by this handler.').query(),
  ),
  tool('proxy_clear_rules', (t) =>
    t.desc('Clear active proxy interception rules while keeping the proxy running.').resettable(),
  ),
  tool('proxy_get_requests', (t) =>
    t
      .desc('Read captured proxy request/response metadata, body previews, and timing.')
      .string('urlFilter', 'Optional URL filter.')
      .query(),
  ),
  tool('proxy_clear_logs', (t) =>
    t.desc('Clear all captured proxy request/response logs.').resettable(),
  ),
  tool('proxy_setup_adb_device', (t) =>
    t
      .desc('Configure an Android device to use the proxy.')
      .string('deviceSerial', 'ADB device serial.'),
  ),
];
