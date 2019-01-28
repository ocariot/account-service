import { ValidationException } from '../exception/validation.exception'
import { Institution } from '../model/institution'

export class InstitutionValidator {
    public static validate(institution: Institution): void | ValidationException {
        const fields: Array<string> = []

        // validate null
        if (!institution.type) fields.push('Type')

        if (fields.length > 0) {
            throw new ValidationException('Required fields were not provided...',
                'Institution validation failed: '.concat(fields.join(', ')).concat(' required!'))
        }
    }
}
