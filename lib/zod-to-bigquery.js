/**
 * Builds a BigQuery field schema based on the provided Zod type.
 *
 * @param {import('zod').ZodObject | import('zod').ZodIntersection | import('zod').ZodEffects} type - The Zod object schema.
 * @returns {import('@google-cloud/bigquery').TableField[]} - An array representing the field schema.
 */
export const convert = (type) => {
  if (type._def.typeName === 'ZodEffects') {
    return convert(type.sourceType());
  }
  if (type._def.typeName === 'ZodObject') {
    return Object.entries(type.shape)
      .map(([name, value]) => convertAny(name, value))
      .filter(Boolean);
  }
  if (type._def.typeName === 'ZodIntersection') {
    return [...convert(type._def.left), ...convert(type._def.right)];
  }
  throw new Error('The provided type must be a ZodObject or ZodIntersection.');
};

/**
 * Converts a given Zod type to a corresponding BigQuery schema.
 * @see @link https://cloud.google.com/bigquery/docs/reference/standard-sql/data-types
 *
 * @param {string} name - The name of the field.
 * @param {import('zod').ZodTypeAny} type - The Zod schema to be converted.
 * @returns {import('@google-cloud/bigquery').TableField|undefined} - The corresponding BigQuery schema or undefined if the type is not relevant.
 * @throws {Error} - When encountering an unsupported Zod type.
 */
const convertAny = (name, type) => {
  switch (type._def.typeName) {
    case 'ZodLiteral': {
      switch (typeof type._def.value) {
        case 'boolean':
          return {
            name,
            type: 'BOOLEAN',
            mode: 'REQUIRED',
          };
        case 'number':
          return {
            name,
            type: 'FLOAT',
            mode: 'REQUIRED',
          };
        case 'bigint':
          return {
            name,
            type: 'INTEGER',
            mode: 'REQUIRED',
          };
        case 'string':
          return {
            name,
            type: 'STRING',
            mode: 'REQUIRED',
          };
        default:
          return;
      }
    }

    case 'ZodArray': {
      const child = convertAny(name, type._def.type);
      if (!child) {
        return;
      }
      return {
        ...child,
        name,
        mode: 'REPEATED',
      };
    }

    case 'ZodObject':
      return {
        name,
        type: 'RECORD',
        mode: 'REQUIRED',
        fields: convert(type),
      };

    case 'ZodTuple':
      return {
        name,
        type: 'RECORD',
        mode: 'REQUIRED',
        fields: type._def.items
          .map((item, i) => {
            return convertAny(`${i}`, item);
          })
          .filter(Boolean),
      };

    // case 'ZodRecord':
    // case 'ZodMap':
    //   return {
    //     name,
    //     type: 'RECORD',
    //     mode: 'REPEATED',
    //     fields: [convertAny('key', type._def.keyType), convertAny('value', type._def.valueType)].filter(Boolean),
    //   };

    case 'ZodSet': {
      const child = convertAny(name, type._def.valueType);
      if (!child) {
        return;
      }
      return {
        ...child,
        name,
        mode: 'REPEATED',
      };
    }

    case 'ZodBoolean':
      return {
        name,
        type: 'BOOLEAN',
        mode: 'REQUIRED',
      };

    case 'ZodNumber':
      if (type._def.checks.some(({ kind }) => kind === 'int')) {
        return {
          name,
          type: 'INTEGER',
          mode: 'REQUIRED',
        };
      }
      return {
        name,
        type: 'FLOAT',
        mode: 'REQUIRED',
      };

    case 'ZodBigInt':
      return {
        name,
        type: 'INTEGER',
        mode: 'REQUIRED',
      };

    case 'ZodNaN':
      return {
        name,
        type: 'FLOAT',
        mode: 'REQUIRED',
      };

    case 'ZodString': {
      const checks = type._def.checks.map(({ kind }) => kind);
      if (checks.includes('datetime')) {
        return {
          name,
          type: 'TIMESTAMP',
          mode: 'REQUIRED',
        };
      }
      if (checks.includes('date')) {
        return {
          name,
          type: 'DATE',
          mode: 'REQUIRED',
        };
      }
      if (checks.includes('time')) {
        return {
          name,
          type: 'TIME',
          mode: 'REQUIRED',
        };
      }
      return {
        name,
        type: 'STRING',
        mode: 'REQUIRED',
      };
    }

    case 'ZodDate':
      return {
        name,
        type: 'TIMESTAMP',
        mode: 'REQUIRED',
      };

    case 'ZodEnum':
    case 'ZodNativeEnum':
      return {
        name,
        type: 'STRING',
        mode: 'REQUIRED',
      };

    case 'ZodOptional':
    case 'ZodNullable': {
      const child = convertAny(name, type._def.innerType);
      if (!child) {
        return;
      }
      return {
        ...child,
        mode: child.mode === 'REQUIRED' ? 'NULLABLE' : child.mode,
      };
    }

    case 'ZodDefault':
      // Ignore the type
      return convertAny(name, type._def.innerType);

    case 'ZodEffects':
      // Ignore the type
      return convertAny(name, type._def.schema);

    case 'ZodUndefined':
    case 'ZodNull':
    case 'ZodUnknown':
    case 'ZodNever':
    case 'ZodVoid':
    case 'ZodFunction':
    case 'ZodPromise':
    case 'ZodLazy':
      // Ignore the field
      return;

    case 'ZodRecord':
    case 'ZodMap':
    case 'ZodUnion':
    case 'ZodDiscriminatedUnion':
    case 'ZodIntersection':
    case 'ZodAny':
      return {
        name,
        type: 'JSON',
        mode: 'REQUIRED',
      };

    default:
      throw new Error(
        `The unknown type "${type._def.typeName}" is not supported in Zoq. Must be translated into the types supported by BigQuery before conversion. See https://cloud.google.com/bigquery/docs/reference/standard-sql/data-types`,
      );
  }
};
