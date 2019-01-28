import { injectable } from 'inversify'
import { IEntityMapper } from '../../port/entity.mapper.interface'
import { Institution } from '../../../application/domain/model/institution'
import { Child } from '../../../application/domain/model/child'
import { ChildEntity } from '../child.entity'

@injectable()
export class ChildEntityMapper implements IEntityMapper<Child, ChildEntity> {
    public transform(item: any): any {
        if (item instanceof Child) return this.modelToModelEntity(item)
        if (item instanceof ChildEntity) return this.modelEntityToModel(item)
        return this.jsonToModel(item) // json
    }

    /**
     * Convert {Child} for {ChildEntity}.
     *
     * @see Creation Date should not be mapped to the type the repository understands.
     * Because this attribute is created automatically by the database.
     * Therefore, if a null value is passed at update time, an exception is thrown.
     * @param item
     */
    public modelToModelEntity(item: Child): ChildEntity {
        const result: ChildEntity = new ChildEntity()
        if (item.id) result.id = item.id
        if (item.username) result.username = item.username
        if (item.password) result.password = item.password
        if (item.type) result.type = item.type
        if (item.institution) result.institution = item.institution.id
        if (item.gender) result.gender = item.gender
        if (item.age) result.age = item.age

        return result
    }

    /**
     * Convert {ChildEntity} for {Child}.
     *
     * @see Each attribute must be mapped only if it contains an assigned value,
     * because at some point the attribute accessed may not exist.
     * @param item
     */
    public modelEntityToModel(item: ChildEntity): Child {
        throw Error('Not implemented!')
    }

    /**
     * Convert JSON for {Child}.
     *
     * @see Each attribute must be mapped only if it contains an assigned value,
     * because at some point the attribute accessed may not exist.
     * @param json
     */
    public jsonToModel(json: any): Child {
        const result: Child = new Child()
        if (!json) return result

        if (json.id !== undefined) result.id = json.id
        if (json.username !== undefined) result.username = json.username
        if (json.password !== undefined) result.password = json.password
        if (json.type !== undefined) result.type = json.type
        if (json.institution !== undefined) {
            if (json.institution === null) result.institution = undefined
            else result.institution = new Institution().fromJSON(json.institution)
        }
        if (json.gender !== undefined) result.gender = json.gender
        if (json.age !== undefined) result.age = json.age

        return result
    }
}
