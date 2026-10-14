/** Azure DevOps field types, as the field list reports them. */
export const isDateType = (t?: string) => !!t && /^datetime$/i.test(t);
/** Long text (plain or rich): the kind of field a grid stores its rows in. */
export const isLongTextType = (t?: string) => !!t && /^(plaintext|html)$/i.test(t);
/** A number field (integer or decimal): a percent complete, or hours. */
export const isNumberType = (t?: string) => !!t && /^(integer|double)$/i.test(t);
/** Fields that can classify an Epic: short text, pick lists, yes/no, numbers; not long text and not dates. */
export const isCategoryType = (t?: string) => !t || !/^(plaintext|html|datetime|history|treepath|identity)$/i.test(t);
