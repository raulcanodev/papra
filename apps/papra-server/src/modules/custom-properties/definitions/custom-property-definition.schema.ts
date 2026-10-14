import { z } from 'zod';
import { CUSTOM_PROPERTY_ENTITY_TYPES_LIST, GENERIC_CUSTOM_PROPERTY_ENTITY_TYPES } from '../custom-properties.constants';

export const customPropertyDefinitionNameSchema = z.string().trim().min(1).max(255);
export const customPropertyDefinitionDescriptionSchema = z.string().trim().max(1000);
export const customPropertyDefinitionDisplayOrderSchema = z.number().int().min(0);
export const customPropertyEntityTypeSchema = z.enum(CUSTOM_PROPERTY_ENTITY_TYPES_LIST as [typeof CUSTOM_PROPERTY_ENTITY_TYPES_LIST[number], ...typeof CUSTOM_PROPERTY_ENTITY_TYPES_LIST]);
export const genericCustomPropertyEntityTypeSchema = z.enum(GENERIC_CUSTOM_PROPERTY_ENTITY_TYPES);
