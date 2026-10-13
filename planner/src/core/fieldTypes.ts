/** Azure DevOps field types, as the field list reports them. */
export const isDateType = (t?: string) => !!t && /^datetime$/i.test(t);
/** Long text (plain or rich): the kind of field a grid stores its rows in. */
export const isLongTextType = (t?: string) => !!t && /^(plaintext|html)$/i.test(t);
