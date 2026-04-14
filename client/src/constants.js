export const ENTITY_TYPES = [
  { value: 'api',                  label: 'API / Service' },
  { value: 'custom',               label: 'Custom' },
  { value: 'microsoft_dataverse',  label: 'Microsoft Dataverse' },
  { value: 'power_app',            label: 'Power App' },
  { value: 'power_automate_flow',  label: 'Power Automate Flow' },
  { value: 'pp_dataflow',          label: 'PP Dataflow' },
  { value: 'qlik_app',             label: 'Qlik App' },
  { value: 'sap',                  label: 'SAP' },
  { value: 'sharepoint_list',      label: 'SharePoint List' },
  { value: 'sql_stored_procedure', label: 'SQL Stored Procedure' },
  { value: 'sql_table',            label: 'SQL Table' },
];

export const TYPE_LABELS = Object.fromEntries(ENTITY_TYPES.map(t => [t.value, t.label]));

export const TRIGGER_TYPES = [
  { value: 'scheduled',   label: 'Scheduled' },
  { value: 'event',       label: 'Event-based' },
  { value: 'manual',      label: 'Manual' },
  { value: 'http',        label: 'HTTP Request' },
];

export const ENVIRONMENTS = ['Production', 'Development', 'Test', 'Staging'];

export const RECURRENCE_FREQUENCIES = ['Minute', 'Hour', 'Day', 'Week', 'Month'];

export const SOURCE_SYSTEMS = ['SAP', 'K+N API', 'Manual Upload', 'SharePoint', 'External FTP', 'Other'];

export const TIMEZONES = [
  'UTC',
  'Europe/London',
  'Europe/Amsterdam',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Stockholm',
  'Europe/Warsaw',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Hong_Kong',
  'Asia/Kolkata',
  'Asia/Kuala_Lumpur',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];
