import { inject, injectable } from 'inversify'
import { BaseRepository } from './base/base.repository'
import { UserType } from '../../application/domain/model/user'
import { IEntityMapper } from '../port/entity.mapper.interface'
import { ILogger } from '../../utils/custom.logger'
import { Identifier } from '../../di/identifiers'
import { Query } from './query/query'
import { IApplicationRepository } from '../../application/port/application.repository.interface'
import { Application } from '../../application/domain/model/application'
import { ApplicationEntity } from '../entity/application.entity'
import { IUserRepository } from '../../application/port/user.repository.interface'
import { IQuery } from '../../application/port/query.interface'

/**
 * Implementation of the repository for user of type Application.
 *
 * @implements {IApplicationRepository}
 */
@injectable()
export class ApplicationRepository extends BaseRepository<Application, ApplicationEntity> implements IApplicationRepository {

    constructor(
        @inject(Identifier.USER_REPO_MODEL) readonly applicationModel: any,
        @inject(Identifier.APPLICATION_ENTITY_MAPPER) readonly applicationMapper: IEntityMapper<Application, ApplicationEntity>,
        @inject(Identifier.USER_REPOSITORY) private readonly _userRepository: IUserRepository,
        @inject(Identifier.LOGGER) readonly logger: ILogger
    ) {
        super(applicationModel, applicationMapper, logger)
    }

    public create(item: Application): Promise<Application> {
        // Encrypt password
        if (item.password) item.password = this._userRepository.encryptPassword(item.password)
        const itemNew: Application = this.mapper.transform(item)
        return new Promise<Application>((resolve, reject) => {
            this.Model.create(itemNew)
                .then((result) => {
                    // Required due to 'populate ()' routine.
                    // If there is no need for 'populate ()', the return will suffice.
                    const query = new Query()
                    query.filters = result._id
                    return resolve(this.findOne(query))
                })
                .catch(err => reject(this.mongoDBErrorListener(err)))
        })
    }

    public find(query: IQuery): Promise<Array<Application>> {
        const q: any = query.toJSON()
        const populate: any = { path: 'institution', select: {}, match: {} }

        for (const key in q.filters) {
            if (key.startsWith('institution.')) {
                populate.match[key.split('.')[1]] = q.filters[key]
                delete q.filters[key]
            }
        }

        for (const key in q.fields) {
            if (key.startsWith('institution.')) {
                populate.select[key.split('.')[1]] = 1
                delete q.fields[key]
            }
        }

        return new Promise<Array<Application>>((resolve, reject) => {
            this.Model.find(q.filters)
                .select(q.fields)
                .sort(q.ordination)
                .skip(Number((q.pagination.limit * q.pagination.page) - q.pagination.limit))
                .limit(Number(q.pagination.limit))
                .populate(populate)
                .exec()
                .then((result: Array<Application>) => resolve(
                    result
                        .filter(item => item.institution)
                        .map(item => this.mapper.transform(item))
                ))
                .catch(err => reject(this.mongoDBErrorListener(err)))
        })
    }

    public findOne(query: IQuery): Promise<Application> {
        const q: any = query.toJSON()
        const populate: any = { path: 'institution', select: {}, match: {} }

        for (const key in q.fields) {
            if (key.startsWith('institution.')) {
                populate.select[key.split('.')[1]] = 1
                delete q.fields[key]
            }
        }

        return new Promise<Application>((resolve, reject) => {
            this.Model.findOne(q.filters)
                .select(q.fields)
                .populate(populate)
                .exec()
                .then((result: Application) => {
                    if (!result) return resolve(undefined)
                    return resolve(this.mapper.transform(result))
                })
                .catch(err => reject(this.mongoDBErrorListener(err)))
        })
    }

    public update(item: Application): Promise<Application> {
        const itemUp: any = this.mapper.transform(item)
        return new Promise<Application>((resolve, reject) => {
            this.Model.findOneAndUpdate({ _id: itemUp.id }, itemUp, { new: true })
                .populate('institution')
                .exec()
                .then((result: Application) => {
                    if (!result) return resolve(undefined)
                    return resolve(this.mapper.transform(result))
                })
                .catch(err => reject(this.mongoDBErrorListener(err)))
        })
    }

    public checkExist(application: Application): Promise<boolean> {
        const query: Query = new Query()
        if (application.id) query.filters = { _id: application.id }
        else query.filters = { username: application.username }

        query.addFilter({ type: UserType.APPLICATION })
        return new Promise<boolean>((resolve, reject) => {
            super.findOne(query)
                .then((result: Application) => {
                    if (result) return resolve(true)
                    return resolve(false)
                })
                .catch(err => reject(super.mongoDBErrorListener(err)))
        })
    }
}
