import { ValidationException } from '../exception/validation.exception'
import { User } from '../model/user'
import { ObjectIdValidator } from './object.id.validator'
import { Strings } from '../../../utils/strings'

export class UpdateUserValidator {
    public static validate(user: User): void | ValidationException {
        if (user.id) {
            try {
                ObjectIdValidator.validate(user.id)
            } catch (err) {
                throw new ValidationException('USER_ID_INVALID')
            }
        }
        if (user.username !== undefined && user.username.length === 0) {
            throw new ValidationException('Username field is invalid...',
                'Username must have at least one character.')
        }
        if (user.institution && user.institution.id) {
            try {
                ObjectIdValidator.validate(user.institution.id, Strings.INSTITUTION.PARAM_ID_NOT_VALID_FORMAT)
            } catch (err) {
                throw new ValidationException('INSTITUTION_ID_INVALID')
            }
        }
        // validate parameters that can not be updated.
        if (user.password) {
            throw new ValidationException('This parameter could not be updated.',
                'A specific route to update user password already exists.' +
                `Access: PATCH /users/${user.id}/password to update your password.`)
        }
    }
}
