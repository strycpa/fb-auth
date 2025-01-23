import { BigQuery } from '@google-cloud/bigquery';
import { log } from 'apify';
import _ from 'lodash';
import { z } from 'zod';
import config from '../config.js';
import { convert } from './zod-to-bigquery.js';

/**
 * Creates a BigQuery client based on the provided options.
 *
 * @param {Object} options - The options object.
 * @param {string} [options.projectId] - The project ID to use.
 * @param {string} [options.location] - The location to use.
 * @returns {BigQuery} The BigQuery client instance.
 */
export const getBigQuery = (options = {}) => {
  const projectId = options.projectId ?? config.projectId;
  const location = options.location ?? config.location;
  return new BigQuery({ projectId, location });
};

/**
 * Get a BigQuery table or create a new table with the specified schema if it doesn't exist.
 *
 * @param {string} fullyQualifiedTableName.
 * @param {import('zod').ZodObject | import('zod').ZodIntersection | import('zod').ZodEffects} [schema] - The table schema.
 * @param {import('@google-cloud/bigquery').TableMetadata} [config] - Optional configuration options.
 * @returns {Promise<import('@google-cloud/bigquery').Table>} A Promise that resolves to the BigQuery table.
 */
export const getTable = async (fullyQualifiedTableName, schema, config = {}) => {
  const [projectId, datasetId, tableId] = fullyQualifiedTableName.split(/[:.]/);

  const bigQuery = getBigQuery({ projectId });
  const dataset = bigQuery.dataset(datasetId);

  const [datasetExists] = await dataset.exists();
  if (!datasetExists) {
    await dataset.create();
    const [datasetMetadata] = await dataset.getMetadata();
    log.info(`Dataset ${datasetId} created in location ${datasetMetadata.location}`);
  }

  const table = dataset.table(tableId);

  if (schema) {
    const tableSchema = convert(schema);
    const [exists] = await table.exists();
    if (exists) {
      log.info(`Table ${tableId} already exists`);
      await table.setMetadata({ ...config, schema: tableSchema });
      log.info(`Table ${tableId} schema updated`);
    } else {
      await table.create({ ...config, schema: tableSchema });
      const [tableMetadata] = await table.getMetadata();
      log.info(`Table ${tableId} created in location ${tableMetadata.location}`);
    }
  }

  return table;
};

/**
 * Executes a BigQuery query and returns the parsed results.
 *
 * @param {string} query - The query to execute.
 * @param {import('zod').ZodType} [schema] - The schema to parse the query results.
 * @param {import('@google-cloud/bigquery').Query} [options] - Optional configuration options.
 * @returns {Promise<Record<string, any>[]>} A Promise that resolves to the parsed query results.
 */
export const bqSelect = async (query, schema, options = {}) => {
  const bigQuery = getBigQuery(options);
  const [rows, { job }] = await bigQuery.query({ query, ...options });
  const [metadata] = await job.getMetadata();
  const stats = _.pick(metadata.statistics.query, ['statementType', 'totalSlotMs', 'totalBytesBilled', 'dmlStats']);
  log.debug('Query stats', stats);

  if (!schema) return rows;
  return rows.map((r) => schema.parse(r));
};

/**
 * Executes a BigQuery query.
 *
 * @param {string} query - The query to execute.
 * @param {import('@google-cloud/bigquery').Query} [options] - Optional configuration options.
 * @returns {Promise<bigquery.IJob>}
 */
export const bqQuery = async (query, options = {}) => {
  const bigQuery = getBigQuery(options);
  const projectId = options.projectId ?? config.projectId;
  const location = options.location ?? config.location;
  const [job] = await bigQuery.createQueryJob({
    query,
    projectId,
    location,
    ...options,
  });
  await job.getQueryResults();
  const [metadata] = await job.getMetadata();
  const stats = _.pick(metadata.statistics.query, ['statementType', 'totalSlotMs', 'totalBytesBilled', 'dmlStats']);
  log.debug('Query stats', stats);

  return metadata;
};

/**
 * Execute a BigQuery query and return the results as a stream.
 *
 * @param {string} query - The query to execute.
 * @param {import('@google-cloud/bigquery').Query & {debugMessage?: string; countRows?: boolean}} [options] - Optional configuration options.
 * @returns {Promise<import('@google-cloud/bigquery').ResourceStream>} A Promise that resolves to the parsed query results.
 */
export const bqReadStream = async (query, options = {}) => {
  if (options.countRows !== false) {
    const countQuery = `SELECT COUNT(*) as count FROM (${query})`;
    const [count] = await bqSelect(
      countQuery,
      z.object({ count: z.number() }).transform((row) => row.count),
      options,
    );

    log.info(`Querying ${count} ${options.debugMessage ?? 'rows'}`);
  }

  const bigQuery = getBigQuery(options);
  const projectId = options.projectId ?? config.projectId;
  const location = options.location ?? config.location;
  const [job] = await bigQuery.createQueryJob({
    query,
    projectId,
    location,
    ...options,
  });

  const queryResultsStream = job.getQueryResultsStream();

  queryResultsStream.on('close', async () => {
    const [metadata] = await job.getMetadata();
    log.debug(
      'Stream query stats',
      _.pick(metadata.statistics.query, ['statementType', 'totalSlotMs', 'totalBytesBilled', 'dmlStats']),
    );
  });

  return queryResultsStream;
};

/**
 * Refreshes a specified materialized view in BigQuery.
 *
 * @param {string} view - The fully qualified name of the materialized view to refresh.
 * @param {import('@google-cloud/bigquery').Query} [options] - Optional configuration options.
 * @returns {Promise<void>} A promise that resolves when the materialized view has been refreshed.
 */
export const refreshMaterializedView = async (view, options) => {
  log.info('Refreshing materialized view...');
  await bqQuery(`CALL BQ.REFRESH_MATERIALIZED_VIEW('${view}')`, options);
};
