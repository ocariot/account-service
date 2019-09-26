import { expect } from 'chai'
import { DIContainer } from '../../../src/di/di'
import { Identifier } from '../../../src/di/identifiers'
import { IBackgroundTask } from '../../../src/application/port/background.task.interface'
import { IEventBus } from '../../../src/infrastructure/port/eventbus.interface'
import { Default } from '../../../src/utils/default'
import { IDatabase } from '../../../src/infrastructure/port/database.interface'
import { IChildRepository } from '../../../src/application/port/child.repository.interface'
import { UserRepoModel } from '../../../src/infrastructure/database/schema/user.schema'
import { InstitutionRepoModel } from '../../../src/infrastructure/database/schema/institution.schema'
import { Child, Gender } from '../../../src/application/domain/model/child'
import { ChildMock } from '../../mocks/child.mock'
import { Family } from '../../../src/application/domain/model/family'
import { FamilyMock } from '../../mocks/family.mock'
import { IFamilyRepository } from '../../../src/application/port/family.repository.interface'
import { Strings } from '../../../src/utils/strings'
import { Educator } from '../../../src/application/domain/model/educator'
import { EducatorMock } from '../../mocks/educator.mock'
import { IEducatorRepository } from '../../../src/application/port/educator.repository.interface'
import { IChildrenGroupRepository } from '../../../src/application/port/children.group.repository.interface'
import { HealthProfessional } from '../../../src/application/domain/model/health.professional'
import { HealthProfessionalMock } from '../../mocks/health.professional.mock'
import { IHealthProfessionalRepository } from '../../../src/application/port/health.professional.repository.interface'
import { Application } from '../../../src/application/domain/model/application'
import { ApplicationMock } from '../../mocks/application.mock'
import { IApplicationRepository } from '../../../src/application/port/application.repository.interface'
import { Institution } from '../../../src/application/domain/model/institution'
import { InstitutionMock } from '../../mocks/institution.mock'
import { IInstitutionRepository } from '../../../src/application/port/institution.repository.interface'

const dbConnection: IDatabase = DIContainer.get(Identifier.MONGODB_CONNECTION)
const rabbitmq: IEventBus = DIContainer.get(Identifier.RABBITMQ_EVENT_BUS)
const providerEventBusTask: IBackgroundTask = DIContainer.get(Identifier.PROVIDER_EVENT_BUS_TASK)
const childRepository: IChildRepository = DIContainer.get(Identifier.CHILD_REPOSITORY)
const familyRepository: IFamilyRepository = DIContainer.get(Identifier.FAMILY_REPOSITORY)
const educatorRepository: IEducatorRepository = DIContainer.get(Identifier.EDUCATOR_REPOSITORY)
const childrenGroupRepository: IChildrenGroupRepository = DIContainer.get(Identifier.CHILDREN_GROUP_REPOSITORY)
const healthProfRepository: IHealthProfessionalRepository = DIContainer.get(Identifier.HEALTH_PROFESSIONAL_REPOSITORY)
const applicationRepository: IApplicationRepository = DIContainer.get(Identifier.APPLICATION_REPOSITORY)
const institutionRepository: IInstitutionRepository = DIContainer.get(Identifier.INSTITUTION_REPOSITORY)

describe('PROVIDER EVENT BUS TASK', () => {
    // Timeout function for control of execution
    const timeout = (milliseconds) => {
        return new Promise(resolve => setTimeout(resolve, milliseconds))
    }

    // Start DB connection, RabbitMQ connection and ProviderEventBusTask
    before(async () => {
        try {
            await dbConnection.connect(process.env.MONGODB_URI_TEST || Default.MONGODB_URI_TEST,
                { interval: 100 })

            await deleteAllUsers()
            await deleteAllInstitutions()

            await rabbitmq.initialize(process.env.RABBITMQ_URI || Default.RABBITMQ_URI,
                { interval: 100, receiveFromYourself: true, sslOptions: { ca: [] }, rpcTimeout: 5000 })

            providerEventBusTask.run()

            await timeout(2000)
        } catch (err) {
            throw new Error('Failure on ProviderEventBusTask test: ' + err.message)
        }
    })

    // Stop DB connection and ProviderEventBusTask
    after(async () => {
        try {
            await deleteAllUsers()
            await deleteAllInstitutions()

            await dbConnection.dispose()

            await providerEventBusTask.stop()
        } catch (err) {
            throw new Error('Failure on ProviderEventBusTask test: ' + err.message)
        }
    })

    /**
     * PROVIDERS
     */
    describe('Provider Child', () => {
        context('when retrieving children through a query successfully when there is at least ' +
            'one matching child associated with the institution_id passed in the query', () => {
            before(async () => {
                try {
                    await deleteAllUsers()
                } catch (err) {
                    throw new Error('Failure on Provider Child test: ' + err.message)
                }
            })
            // Delete all children from database after each test case
            after(async () => {
                try {
                    await deleteAllUsers()
                } catch (err) {
                    throw new Error('Failure on Provider Child test: ' + err.message)
                }
            })
            it('should return an array with one child', (done) => {
                const child: Child = new ChildMock()
                child.institution!.id = '5a62be07d6f33400146c9b61'

                childRepository.create(child)
                    .then(async () => {
                        const result = await rabbitmq.bus.getChildren('?institution=5a62be07d6f33400146c9b61')
                        expect(result.length).to.eql(1)
                        // As a new resource saved in the database always has a new id,
                        // this is necessary before comparing the saved resource in the
                        // database with the one sent to the bus.
                        child.id = result[0].id
                        // Comparing the resources
                        expect(result[0].id).to.eql(child.id)
                        expect(result[0].username).to.eql(child.username)
                        expect(result[0].type).to.eql(child.type)
                        expect(result[0].institution_id).to.eql(child.institution!.id)
                        expect(result[0].gender).to.eql(child.gender)
                        expect(result[0].age).to.eql(child.age)
                        expect(result[0].last_login).to.eql(child.last_login!.toISOString())
                        expect(result[0].last_sync).to.eql(child.last_sync!.toISOString())
                        done()
                    })
                    .catch(done)
            })
        })

        context('when retrieving children through a query successfully when there is at least one matching child', () => {
            before(async () => {
                try {
                    await deleteAllUsers()

                    const child1: Child = new ChildMock()
                    child1.institution!.id = '5a62be07d6f33400146c9b61'
                    child1.gender = Gender.MALE
                    child1.age = 8

                    const child2: Child = new ChildMock()
                    child2.institution!.id = '5a62be07d6f33400146c9b61'
                    child2.gender = Gender.FEMALE
                    child2.age = 9

                    const child3: Child = new ChildMock()
                    child3.institution!.id = '5a62be07d6f33400146c9b61'
                    child3.gender = Gender.MALE
                    child3.age = 10

                    const child4: Child = new ChildMock()
                    child4.institution!.id = '5a62be07de34500146d9c544'
                    child4.gender = Gender.FEMALE
                    child4.age = 6

                    const child5: Child = new ChildMock()
                    child5.institution!.id = '5a62be07de34500146d9c544'
                    child5.gender = Gender.MALE
                    child5.age = 7

                    const child6: Child = new ChildMock()
                    child6.institution!.id = '5a62be07de34500146d9c544'
                    child6.gender = Gender.FEMALE
                    child6.age = 7

                    const userModel: any = DIContainer.get(Identifier.USER_REPO_MODEL)
                    const child7: any = {
                        username: 'child7',
                        password: 'password_child7',
                        type: 'child',
                        institution: '5a62be07d6f33400146c9b61',
                        gender: 'male',
                        age: 7,
                        created_at: '2019-01-20T00:00:00.000Z'
                    }

                    const child8: any = {
                        username: 'child8',
                        password: 'password_child8',
                        type: 'child',
                        institution: '5a62be07d6f33400146c9b62',
                        gender: 'female',
                        age: 7,
                        created_at: '2019-01-30T00:00:00.000Z'
                    }

                    const child9: any = {
                        username: 'child9',
                        password: 'password_child9',
                        type: 'child',
                        institution: '5a62be07d6f33400146c9b61',
                        gender: 'female',
                        age: 7,
                        created_at: '2019-01-30T00:00:00.000Z'
                    }

                    userModel.create(child7)
                    userModel.create(child8)
                    userModel.create(child9)

                    await childRepository.create(child1)
                    await childRepository.create(child2)
                    await childRepository.create(child3)
                    await childRepository.create(child4)
                    await childRepository.create(child5)
                    await childRepository.create(child6)
                } catch (err) {
                    throw new Error('Failure on Provider Child test: ' + err.message)
                }
            })
            after(async () => {
                try {
                    await deleteAllUsers()
                } catch (err) {
                    throw new Error('Failure on Provider Child test: ' + err.message)
                }
            })
            it('should return an array with nine children (regardless of association with an institution)', (done) => {
                rabbitmq.bus.getChildren('')
                    .then(result => {
                        expect(result.length).to.eql(9)
                        done()
                    })
                    .catch(done)
            })

            it('should return an empty array (no child matches query)', (done) => {
                rabbitmq.bus.getChildren('?institution=5a62be07d6f33400146c9b64')
                    .then(result => {
                        expect(result.length).to.eql(0)
                        done()
                    })
                    .catch(done)
            })

            it('should return an array with three children (query all children by institution)', (done) => {
                rabbitmq.bus.getChildren('?institution=5a62be07de34500146d9c544')
                    .then(result => {
                        expect(result.length).to.eql(3)
                        done()
                    })
                    .catch(done)
            })

            it('should return an array with three children (query all registered children within 1 month)', (done) => {
                rabbitmq.bus.getChildren('?start_at=2019-01-20T00:00:00.000Z&period=1m')
                    .then(result => {
                        expect(result.length).to.eql(3)
                        done()
                    })
                    .catch(done)
            })

            it('should return an array with two children (query all registered children within 1 month in an institution)',
                (done) => {
                    rabbitmq.bus.getChildren('?start_at=2019-01-20T00:00:00.000Z&period=1m&institution=5a62be07d6f33400146c9b61')
                        .then(result => {
                            expect(result.length).to.eql(2)
                            done()
                        })
                        .catch(done)
                })

            it('should return an array with four children (query all male children)', (done) => {
                rabbitmq.bus.getChildren('?gender=male')
                    .then(result => {
                        expect(result.length).to.eql(4)
                        done()
                    })
                    .catch(done)
            })

            it('should return an array with three children (query all male children of an institution)', (done) => {
                rabbitmq.bus.getChildren('?gender=male&institution=5a62be07d6f33400146c9b61')
                    .then(result => {
                        expect(result.length).to.eql(3)
                        done()
                    })
                    .catch(done)
            })

            it('should return an array with five children (query all female children)', (done) => {
                rabbitmq.bus.getChildren('?gender=female')
                    .then(result => {
                        expect(result.length).to.eql(5)
                        done()
                    })
                    .catch(done)
            })

            it('should return an array with two children (query all female children of an institution)', (done) => {
                rabbitmq.bus.getChildren('?gender=female&institution=5a62be07de34500146d9c544')
                    .then(result => {
                        expect(result.length).to.eql(2)
                        done()
                    })
                    .catch(done)
            })

            it('should return an array with seven children (query all children under 9 years)', (done) => {
                rabbitmq.bus.getChildren('?age=lt:9')
                    .then(result => {
                        expect(result.length).to.eql(7)
                        done()
                    })
                    .catch(done)
            })

            it('should return an array with three children (query all children under 9 years of an institution)', (done) => {
                rabbitmq.bus.getChildren('?age=lt:9&institution=5a62be07d6f33400146c9b61')
                    .then(result => {
                        expect(result.length).to.eql(3)
                        done()
                    })
                    .catch(done)
            })

            it('should return an array with four children (query all female children under 9 years)', (done) => {
                rabbitmq.bus.getChildren('?gender=female&age=lt:9')
                    .then(result => {
                        expect(result.length).to.eql(4)
                        done()
                    })
                    .catch(done)
            })

            it('should return an array with four children (query all female children between 7 and 10 years old)', (done) => {
                rabbitmq.bus.getChildren('?gender=female&age=gte:7&age=lte:10')
                    .then(result => {
                        expect(result.length).to.eql(4)
                        done()
                    })
                    .catch(done)
            })

            it('should return an array with one child ' +
                '(query all female children between 7 and 10 years old of an institution)', (done) => {
                rabbitmq.bus.getChildren('?gender=female&age=gte:7&age=lte:10&institution=5a62be07de34500146d9c544')
                    .then(result => {
                        expect(result.length).to.eql(1)
                        done()
                    })
                    .catch(done)
            })
        })

        context('when trying to retrieve children through invalid query', () => {
            before(async () => {
                try {
                    await deleteAllUsers()

                    const child: Child = new ChildMock()
                    child.institution!.id = '5a62be07d6f33400146c9b61'

                    await childRepository.create(child)
                } catch (err) {
                    throw new Error('Failure on Provider Child test: ' + err.message)
                }
            })
            // Delete all children from database after each test case
            after(async () => {
                try {
                    await deleteAllUsers()
                } catch (err) {
                    throw new Error('Failure on Provider Child test: ' + err.message)
                }
            })
            it('should return a ValidationException (query with an invalid institution id)', (done) => {
                rabbitmq.bus.getChildren('?institution=invalidInstitutionId')
                    .then(result => {
                        expect(result.length).to.eql(0)
                        done(new Error('The find method of the repository should not function normally'))
                    })
                    .catch((err) => {
                        try {
                            expect(err.message).to.eql('Error: '.concat(Strings.ERROR_MESSAGE.UUID_NOT_VALID_FORMAT))
                            done()
                        } catch (err) {
                            done(err)
                        }
                    })
            })

            it('should return a ValidationException (query with an invalid number)', (done) => {
                rabbitmq.bus.getChildren('?age=invalidAge')
                    .then(result => {
                        expect(result.length).to.eql(0)
                        done(new Error('The find method of the repository should not function normally'))
                    })
                    .catch((err) => {
                        try {
                            expect(err.message).to.eql('Error: '.concat('The value \'invalidAge\' of age field is not a number.'))
                            done()
                        } catch (err) {
                            done(err)
                        }
                    })
            })

            it('should return a ValidationException (query with an invalid date (last_login))', (done) => {
                rabbitmq.bus.getChildren('?last_login=invalidLastLogin')
                    .then(result => {
                        expect(result.length).to.eql(0)
                        done(new Error('The find method of the repository should not function normally'))
                    })
                    .catch((err) => {
                        try {
                            expect(err.message).to.eql('Error: '
                                .concat('Datetime: invalidLastLogin is not in valid ISO 8601 format.'))
                            done()
                        } catch (err) {
                            done(err)
                        }
                    })
            })

            it('should return a ValidationException (query with an invalid date (last_sync))', (done) => {
                rabbitmq.bus.getChildren('?last_sync=invalidLastSync')
                    .then(result => {
                        expect(result.length).to.eql(0)
                        done(new Error('The find method of the repository should not function normally'))
                    })
                    .catch((err) => {
                        try {
                            expect(err.message).to.eql('Error: '
                                .concat('Datetime: invalidLastSync is not in valid ISO 8601 format.'))
                            done()
                        } catch (err) {
                            done(err)
                        }
                    })
            })
        })

        context('when trying to recover children through a query unsuccessful (without MongoDB connection)',
            () => {
                before(async () => {
                    try {
                        await dbConnection.dispose()
                    } catch (err) {
                        throw new Error('Failure on Provider Child test: ' + err.message)
                    }
                })
                after(async () => {
                    try {
                        await dbConnection.connect(process.env.MONGODB_URI_TEST || Default.MONGODB_URI_TEST,
                            { interval: 100 })
                    } catch (err) {
                        throw new Error('Failure on Provider Child test: ' + err.message)
                    }
                })
                it('should return a rpc timeout error', (done) => {
                    rabbitmq.bus.getChildren('?institution=5a62be07d6f33400146c9b61')
                        .then(() => {
                            done(new Error('RPC should not function normally'))
                        })
                        .catch((err) => {
                            try {
                                expect(err.message).to.eql('rpc timed out')
                                done()
                            } catch (err) {
                                done(err)
                            }
                        })
                })
            })
    })

    describe('Provider Family / Family Children', () => {
        context('when retrieving families through a query successfully', () => {
            const family: Family = new FamilyMock()
            family.institution!.id = '5a62be07d6f33400146c9b61'
            before(async () => {
                try {
                    await deleteAllUsers()

                    const childCreated1 = await childRepository.create(family.children![0])
                    family.children![0].id = childCreated1.id

                    const childCreated2 = await childRepository.create(family.children![1])
                    family.children![1].id = childCreated2.id

                    const familyCreated = await familyRepository.create(family)
                    family.id = familyCreated.id
                } catch (err) {
                    throw new Error('Failure on Provider Family test: ' + err.message)
                }
            })
            // Delete all families from database after the test cases
            after(async () => {
                try {
                    await deleteAllUsers()
                } catch (err) {
                    throw new Error('Failure on Provider Family test: ' + err.message)
                }
            })
            it('should return an array with one family', (done) => {
                rabbitmq.bus.getFamilies('?institution=5a62be07d6f33400146c9b61')
                    .then(result => {
                        expect(result.length).to.eql(1)
                        // Comparing the resources
                        expect(result[0].id).to.eql(family.id)
                        expect(result[0].username).to.eql(family.username)
                        expect(result[0].type).to.eql(family.type)
                        expect(result[0].institution_id).to.eql(family.institution!.id)
                        expect(result[0].last_login).to.eql(family.last_login!.toISOString())
                        let index = 0
                        for (const elem of result[0].children) {
                            expect(elem.id).to.eql(family.children![index].id)
                            expect(elem.username).to.eql(family.children![index].username)
                            expect(elem.institution_id).to.eql(family.children![index].institution!.id)
                            expect(elem.gender).to.eql(family.children![index].gender)
                            expect(elem.age).to.eql(family.children![index].age)
                            expect(elem.last_login).to.eql(family.children![index].last_login!.toISOString())
                            expect(elem.last_sync).to.eql(family.children![index].last_sync!.toISOString())
                            index++
                        }
                        done()
                    })
                    .catch(done)
            })

            it('should return an array with the children of family', (done) => {
                rabbitmq.bus.getFamilyChildren(family.id!)
                    .then(result => {
                        expect(result.length).to.eql(2)
                        let index = 0
                        for (const elem of result) {
                            expect(elem.id).to.eql(family.children![index].id)
                            expect(elem.username).to.eql(family.children![index].username)
                            expect(elem.type).to.eql(family.children![index].type)
                            expect(elem.institution_id).to.eql(family.children![index].institution!.id)
                            expect(elem.gender).to.eql(family.children![index].gender)
                            expect(elem.age).to.eql(family.children![index].age)
                            expect(elem.last_login).to.eql(family.children![index].last_login!.toISOString())
                            expect(elem.last_sync).to.eql(family.children![index].last_sync!.toISOString())
                            index++
                        }
                        done()
                    })
                    .catch(done)
            })

            it('should return an empty array ()', (done) => {
                rabbitmq.bus.getFamilyChildren('5a62be07d6233300146c9b32')
                    .then(result => {
                        expect(result.length).to.eql(0)
                        done()
                    })
                    .catch(done)
            })

            it('should return a ValidationException (query with an invalid family id)', (done) => {
                rabbitmq.bus.getFamilyChildren('invalidID')
                    .then(() => {
                        done(new Error('The GET method should not function normally'))
                    })
                    .catch((err) => {
                        try {
                            expect(err.message).to.eql('Error: '.concat(Strings.ERROR_MESSAGE.UUID_NOT_VALID_FORMAT))
                            done()
                        } catch (err) {
                            done(err)
                        }
                    })
            })
        })

        context('when retrieving families through a query successfully when there is at least one matching family', () => {
            before(async () => {
                try {
                    await deleteAllUsers()

                    const family1: Family = new FamilyMock()
                    family1.institution!.id = '5a62be07d6f33400146c9b61'

                    const family2: Family = new FamilyMock()
                    family2.institution!.id = '5a62be07d6f33400146c9b61'

                    const family3: Family = new FamilyMock()
                    family3.institution!.id = '5a62be07d6f33400146c9b61'

                    const family4: Family = new FamilyMock()
                    family4.institution!.id = '5a62be07de34500146d9c544'

                    const family5: Family = new FamilyMock()
                    family5.institution!.id = '5a62be07de34500146d9c544'

                    const family6: Family = new FamilyMock()
                    family6.institution!.id = '5a62be07de34500146d9c544'

                    await familyRepository.create(family1)
                    await familyRepository.create(family2)
                    await familyRepository.create(family3)
                    await familyRepository.create(family4)
                    await familyRepository.create(family5)
                    await familyRepository.create(family6)
                } catch (err) {
                    throw new Error('Failure on Provider Family test: ' + err.message)
                }
            })
            after(async () => {
                try {
                    await deleteAllUsers()
                } catch (err) {
                    throw new Error('Failure on Provider Family test: ' + err.message)
                }
            })
            it('should return an array with six families (regardless of association with an institution)', (done) => {
                rabbitmq.bus.getFamilies('')
                    .then(result => {
                        expect(result.length).to.eql(6)
                        done()
                    })
                    .catch(done)
            })

            it('should return an empty array (no family matches query)', (done) => {
                rabbitmq.bus.getFamilies('?institution=5a62be07d6f33400146c9b64')
                    .then(result => {
                        expect(result.length).to.eql(0)
                        done()
                    })
                    .catch(done)
            })

            it('should return an array with three families (query all families by institution)', (done) => {
                rabbitmq.bus.getFamilies('?institution=5a62be07de34500146d9c544')
                    .then(result => {
                        expect(result.length).to.eql(3)
                        done()
                    })
                    .catch(done)
            })
        })

        context('when trying to retrieve families through invalid query', () => {
            before(async () => {
                try {
                    await deleteAllUsers()

                    const family: Family = new FamilyMock()
                    family.institution!.id = '5a62be07d6f33400146c9b61'

                    await familyRepository.create(family)
                } catch (err) {
                    throw new Error('Failure on Provider Family test: ' + err.message)
                }
            })
            // Delete all families from database after each test case
            after(async () => {
                try {
                    await deleteAllUsers()
                } catch (err) {
                    throw new Error('Failure on Provider Family test: ' + err.message)
                }
            })
            it('should return a ValidationException (query with an invalid institution id)', (done) => {
                rabbitmq.bus.getFamilies('?institution=invalidInstitutionId')
                    .then(result => {
                        expect(result.length).to.eql(0)
                        done(new Error('The find method of the repository should not function normally'))
                    })
                    .catch((err) => {
                        try {
                            expect(err.message).to.eql('Error: '.concat(Strings.ERROR_MESSAGE.UUID_NOT_VALID_FORMAT))
                            done()
                        } catch (err) {
                            done(err)
                        }
                    })
            })

            it('should return a ValidationException (query with an invalid date (last_login))', (done) => {
                rabbitmq.bus.getFamilies('?last_login=invalidLastLogin')
                    .then(result => {
                        expect(result.length).to.eql(0)
                        done(new Error('The find method of the repository should not function normally'))
                    })
                    .catch((err) => {
                        try {
                            expect(err.message).to.eql('Error: '
                                .concat('Datetime: invalidLastLogin is not in valid ISO 8601 format.'))
                            done()
                        } catch (err) {
                            done(err)
                        }
                    })
            })
        })

        context('when trying to recover families through a query unsuccessful (without MongoDB connection)',
            () => {
                before(async () => {
                    try {
                        await dbConnection.dispose()
                    } catch (err) {
                        throw new Error('Failure on Provider Family test: ' + err.message)
                    }
                })
                after(async () => {
                    try {
                        await dbConnection.connect(process.env.MONGODB_URI_TEST || Default.MONGODB_URI_TEST,
                            { interval: 100 })
                    } catch (err) {
                        throw new Error('Failure on Provider Family test: ' + err.message)
                    }
                })
                it('should return a rpc timeout error', (done) => {
                    rabbitmq.bus.getFamilies('?institution=5a62be07d6f33400146c9b61')
                        .then(() => {
                            done(new Error('RPC should not function normally'))
                        })
                        .catch((err) => {
                            try {
                                expect(err.message).to.eql('rpc timed out')
                                done()
                            } catch (err) {
                                done(err)
                            }
                        })
                })
            })
    })

    describe('Provider Educator / Educator ChildrenGroup', () => {
        context('when retrieving educators through a query successfully', () => {
            const educator: Educator = new EducatorMock()
            educator.institution!.id = '5a62be07d6f33400146c9b61'
            before(async () => {
                try {
                    await deleteAllUsers()

                    const childCreated1 = await childRepository.create(educator.children_groups![0].children![0])
                    const childCreated2 = await childRepository.create(educator.children_groups![0].children![1])
                    educator.children_groups![0].children![0].id = childCreated1.id
                    educator.children_groups![0].children![1].id = childCreated2.id

                    const childCreated3 = await childRepository.create(educator.children_groups![1].children![0])
                    const childCreated4 = await childRepository.create(educator.children_groups![1].children![1])
                    educator.children_groups![1].children![0].id = childCreated3.id
                    educator.children_groups![1].children![1].id = childCreated4.id

                    const childrenGroupCreated1 = await childrenGroupRepository.create(educator.children_groups![0])
                    educator.children_groups![0].id = childrenGroupCreated1.id

                    const childrenGroupCreated2 = await childrenGroupRepository.create(educator.children_groups![1])
                    educator.children_groups![1].id = childrenGroupCreated2.id

                    const educatorCreated = await educatorRepository.create(educator)
                    educator.id = educatorCreated.id
                } catch (err) {
                    throw new Error('Failure on Provider Educator test: ' + err.message)
                }
            })
            // Delete all educators from database after the test cases
            after(async () => {
                try {
                    await deleteAllUsers()
                } catch (err) {
                    throw new Error('Failure on Provider Educator test: ' + err.message)
                }
            })
            it('should return an array with one educator', (done) => {
                rabbitmq.bus.getEducators('?institution=5a62be07d6f33400146c9b61')
                    .then(result => {
                        expect(result.length).to.eql(1)
                        // Comparing the resources
                        expect(result[0].id).to.eql(educator.id)
                        expect(result[0].username).to.eql(educator.username)
                        expect(result[0].type).to.eql(educator.type)
                        expect(result[0].institution_id).to.eql(educator.institution!.id)
                        expect(result[0].last_login).to.eql(educator.last_login!.toISOString())
                        let index = 0
                        for (const elem of result[0].children_groups) {
                            expect(elem.id).to.eql(educator.children_groups![index].id)
                            expect(elem.name).to.eql(educator.children_groups![index].name)
                            let indexChildren = 0
                            for (const childItem of elem.children) {
                                const childItemMock = educator.children_groups![index].children![indexChildren]
                                expect(childItem.id).to.eql(childItemMock.id)
                                expect(childItem.username).to.eql(childItemMock.username)
                                expect(childItem.institution_id).to.eql(childItemMock.institution!.id)
                                expect(childItem.gender).to.eql(childItemMock.gender)
                                expect(childItem.age).to.eql(childItemMock.age)
                                expect(childItem.last_login).to.eql(childItemMock.last_login!.toISOString())
                                expect(childItem.last_sync).to.eql(childItemMock.last_sync!.toISOString())
                                indexChildren++
                            }
                            expect(elem.school_class).to.eql(educator.children_groups![index].school_class)
                            index++
                        }
                        done()
                    })
                    .catch(done)
            })

            it('should return an array with the children groups of educator', (done) => {
                rabbitmq.bus.getEducatorChildrenGroups(educator.id!)
                    .then(result => {
                        expect(result.length).to.eql(2)
                        let index = 0
                        for (const elem of result) {
                            expect(elem.id).to.eql(educator.children_groups![index].id)
                            expect(elem.name).to.eql(educator.children_groups![index].name)
                            let indexChildren = 0
                            for (const childItem of elem.children) {
                                const childItemMock = educator.children_groups![index].children![indexChildren]
                                expect(childItem.id).to.eql(childItemMock.id)
                                expect(childItem.username).to.eql(childItemMock.username)
                                expect(childItem.institution_id).to.eql(childItemMock.institution!.id)
                                expect(childItem.gender).to.eql(childItemMock.gender)
                                expect(childItem.age).to.eql(childItemMock.age)
                                expect(childItem.last_login).to.eql(childItemMock.last_login!.toISOString())
                                expect(childItem.last_sync).to.eql(childItemMock.last_sync!.toISOString())
                                indexChildren++
                            }
                            expect(elem.school_class).to.eql(educator.children_groups![index].school_class)
                            index++
                        }
                        done()
                    })
                    .catch(done)
            })

            it('should return an empty array (there is no educator with the id provided)', (done) => {
                rabbitmq.bus.getEducatorChildrenGroups('5a62be07d6233300146c9b32')
                    .then(result => {
                        expect(result.length).to.eql(0)
                        done()
                    })
                    .catch(done)
            })

            it('should return a ValidationException (query with an invalid educator id)', (done) => {
                rabbitmq.bus.getEducatorChildrenGroups('invalidID')
                    .then(() => {
                        done(new Error('The GET method should not function normally'))
                    })
                    .catch((err) => {
                        try {
                            expect(err.message).to.eql('Error: '.concat(Strings.ERROR_MESSAGE.UUID_NOT_VALID_FORMAT))
                            done()
                        } catch (err) {
                            done(err)
                        }
                    })
            })
        })

        context('when retrieving educators through a query successfully when there is at least one matching educator', () => {
            before(async () => {
                try {
                    await deleteAllUsers()

                    const educator1: Educator = new EducatorMock()
                    educator1.institution!.id = '5a62be07d6f33400146c9b61'

                    const educator2: Educator = new EducatorMock()
                    educator2.institution!.id = '5a62be07d6f33400146c9b61'

                    const educator3: Educator = new EducatorMock()
                    educator3.institution!.id = '5a62be07d6f33400146c9b61'

                    const educator4: Educator = new EducatorMock()
                    educator4.institution!.id = '5a62be07de34500146d9c544'

                    const educator5: Educator = new EducatorMock()
                    educator5.institution!.id = '5a62be07de34500146d9c544'

                    const educator6: Educator = new EducatorMock()
                    educator6.institution!.id = '5a62be07de34500146d9c544'

                    await educatorRepository.create(educator1)
                    await educatorRepository.create(educator2)
                    await educatorRepository.create(educator3)
                    await educatorRepository.create(educator4)
                    await educatorRepository.create(educator5)
                    await educatorRepository.create(educator6)
                } catch (err) {
                    throw new Error('Failure on Provider Educator test: ' + err.message)
                }
            })
            after(async () => {
                try {
                    await deleteAllUsers()
                } catch (err) {
                    throw new Error('Failure on Provider Educator test: ' + err.message)
                }
            })
            it('should return an array with six educators (regardless of association with an institution)', (done) => {
                rabbitmq.bus.getEducators('')
                    .then(result => {
                        expect(result.length).to.eql(6)
                        done()
                    })
                    .catch(done)
            })

            it('should return an empty array (no educator matches query)', (done) => {
                rabbitmq.bus.getEducators('?institution=5a62be07d6f33400146c9b64')
                    .then(result => {
                        expect(result.length).to.eql(0)
                        done()
                    })
                    .catch(done)
            })

            it('should return an array with three educators (query all educators by institution)', (done) => {
                rabbitmq.bus.getEducators('?institution=5a62be07de34500146d9c544')
                    .then(result => {
                        expect(result.length).to.eql(3)
                        done()
                    })
                    .catch(done)
            })
        })

        context('when trying to retrieve educators through invalid query', () => {
            before(async () => {
                try {
                    await deleteAllUsers()

                    const educator: Educator = new EducatorMock()
                    educator.institution!.id = '5a62be07d6f33400146c9b61'

                    await educatorRepository.create(educator)
                } catch (err) {
                    throw new Error('Failure on Provider Educator test: ' + err.message)
                }
            })
            // Delete all educators from database after each test case
            after(async () => {
                try {
                    await deleteAllUsers()
                } catch (err) {
                    throw new Error('Failure on Provider Educator test: ' + err.message)
                }
            })
            it('should return a ValidationException (query with an invalid institution id)', (done) => {
                rabbitmq.bus.getEducators('?institution=invalidInstitutionId')
                    .then(result => {
                        expect(result.length).to.eql(0)
                        done(new Error('The find method of the repository should not function normally'))
                    })
                    .catch((err) => {
                        try {
                            expect(err.message).to.eql('Error: '.concat(Strings.ERROR_MESSAGE.UUID_NOT_VALID_FORMAT))
                            done()
                        } catch (err) {
                            done(err)
                        }
                    })
            })

            it('should return a ValidationException (query with an invalid date (last_login))', (done) => {
                rabbitmq.bus.getEducators('?last_login=invalidLastLogin')
                    .then(result => {
                        expect(result.length).to.eql(0)
                        done(new Error('The find method of the repository should not function normally'))
                    })
                    .catch((err) => {
                        try {
                            expect(err.message).to.eql('Error: '
                                .concat('Datetime: invalidLastLogin is not in valid ISO 8601 format.'))
                            done()
                        } catch (err) {
                            done(err)
                        }
                    })
            })
        })

        context('when trying to recover educators through a query unsuccessful (without MongoDB connection)',
            () => {
                before(async () => {
                    try {
                        await dbConnection.dispose()
                    } catch (err) {
                        throw new Error('Failure on Provider Educator test: ' + err.message)
                    }
                })
                after(async () => {
                    try {
                        await dbConnection.connect(process.env.MONGODB_URI_TEST || Default.MONGODB_URI_TEST,
                            { interval: 100 })
                    } catch (err) {
                        throw new Error('Failure on Provider Educator test: ' + err.message)
                    }
                })
                it('should return a rpc timeout error', (done) => {
                    rabbitmq.bus.getEducators('?institution=5a62be07d6f33400146c9b61')
                        .then(() => {
                            done(new Error('RPC should not function normally'))
                        })
                        .catch((err) => {
                            try {
                                expect(err.message).to.eql('rpc timed out')
                                done()
                            } catch (err) {
                                done(err)
                            }
                        })
                })
            })
    })

    describe('Provider HealthProfessional / HealthProfessional ChildrenGroup', () => {
        context('when retrieving health professionals through a query successfully', () => {
            const healthProfessional: HealthProfessional = new HealthProfessionalMock()
            healthProfessional.institution!.id = '5a62be07d6f33400146c9b61'
            before(async () => {
                try {
                    await deleteAllUsers()

                    const childCreated1 = await childRepository.create(healthProfessional.children_groups![0].children![0])
                    const childCreated2 = await childRepository.create(healthProfessional.children_groups![0].children![1])
                    healthProfessional.children_groups![0].children![0].id = childCreated1.id
                    healthProfessional.children_groups![0].children![1].id = childCreated2.id

                    const childCreated3 = await childRepository.create(healthProfessional.children_groups![1].children![0])
                    const childCreated4 = await childRepository.create(healthProfessional.children_groups![1].children![1])
                    healthProfessional.children_groups![1].children![0].id = childCreated3.id
                    healthProfessional.children_groups![1].children![1].id = childCreated4.id

                    const childrenGroupCreated1 = await childrenGroupRepository.create(healthProfessional.children_groups![0])
                    healthProfessional.children_groups![0].id = childrenGroupCreated1.id

                    const childrenGroupCreated2 = await childrenGroupRepository.create(healthProfessional.children_groups![1])
                    healthProfessional.children_groups![1].id = childrenGroupCreated2.id

                    const healthProfCreated = await healthProfRepository.create(healthProfessional)
                    healthProfessional.id = healthProfCreated.id
                } catch (err) {
                    throw new Error('Failure on Provider HealthProfessional test: ' + err.message)
                }
            })
            // Delete all health professionals from database after the test cases
            after(async () => {
                try {
                    await deleteAllUsers()
                } catch (err) {
                    throw new Error('Failure on Provider HealthProfessional test: ' + err.message)
                }
            })
            it('should return an array with one health professional', (done) => {
                rabbitmq.bus.getHealthProfessionals('?institution=5a62be07d6f33400146c9b61')
                    .then(result => {
                        expect(result.length).to.eql(1)
                        // Comparing the resources
                        expect(result[0].id).to.eql(healthProfessional.id)
                        expect(result[0].username).to.eql(healthProfessional.username)
                        expect(result[0].type).to.eql(healthProfessional.type)
                        expect(result[0].institution_id).to.eql(healthProfessional.institution!.id)
                        expect(result[0].last_login).to.eql(healthProfessional.last_login!.toISOString())
                        let index = 0
                        for (const elem of result[0].children_groups) {
                            expect(elem.id).to.eql(healthProfessional.children_groups![index].id)
                            expect(elem.name).to.eql(healthProfessional.children_groups![index].name)
                            let indexChildren = 0
                            for (const childItem of elem.children) {
                                const childItemMock = healthProfessional.children_groups![index].children![indexChildren]
                                expect(childItem.id).to.eql(childItemMock.id)
                                expect(childItem.username).to.eql(childItemMock.username)
                                expect(childItem.institution_id).to.eql(childItemMock.institution!.id)
                                expect(childItem.gender).to.eql(childItemMock.gender)
                                expect(childItem.age).to.eql(childItemMock.age)
                                expect(childItem.last_login).to.eql(childItemMock.last_login!.toISOString())
                                expect(childItem.last_sync).to.eql(childItemMock.last_sync!.toISOString())
                                indexChildren++
                            }
                            expect(elem.school_class).to.eql(healthProfessional.children_groups![index].school_class)
                            index++
                        }
                        done()
                    })
                    .catch(done)
            })

            it('should return an array with the children groups of health professional', (done) => {
                rabbitmq.bus.getHealthProfessionalChildrenGroups(healthProfessional.id!)
                    .then(result => {
                        expect(result.length).to.eql(2)
                        let index = 0
                        for (const elem of result) {
                            expect(elem.id).to.eql(healthProfessional.children_groups![index].id)
                            expect(elem.name).to.eql(healthProfessional.children_groups![index].name)
                            let indexChildren = 0
                            for (const childItem of elem.children) {
                                const childItemMock = healthProfessional.children_groups![index].children![indexChildren]
                                expect(childItem.id).to.eql(childItemMock.id)
                                expect(childItem.username).to.eql(childItemMock.username)
                                expect(childItem.institution_id).to.eql(childItemMock.institution!.id)
                                expect(childItem.gender).to.eql(childItemMock.gender)
                                expect(childItem.age).to.eql(childItemMock.age)
                                expect(childItem.last_login).to.eql(childItemMock.last_login!.toISOString())
                                expect(childItem.last_sync).to.eql(childItemMock.last_sync!.toISOString())
                                indexChildren++
                            }
                            expect(elem.school_class).to.eql(healthProfessional.children_groups![index].school_class)
                            index++
                        }
                        done()
                    })
                    .catch(done)
            })

            it('should return an empty array (there is no health professional with the id provided)', (done) => {
                rabbitmq.bus.getHealthProfessionalChildrenGroups('5a62be07d6233300146c9b32')
                    .then(result => {
                        expect(result.length).to.eql(0)
                        done()
                    })
                    .catch(done)
            })

            it('should return a ValidationException (query with an invalid health professional id)', (done) => {
                rabbitmq.bus.getHealthProfessionalChildrenGroups('invalidID')
                    .then(() => {
                        done(new Error('The GET method should not function normally'))
                    })
                    .catch((err) => {
                        try {
                            expect(err.message).to.eql('Error: '.concat(Strings.ERROR_MESSAGE.UUID_NOT_VALID_FORMAT))
                            done()
                        } catch (err) {
                            done(err)
                        }
                    })
            })
        })

        context('when retrieving health professionals through a query successfully when there is at least one matching ' +
            'health professional', () => {
            before(async () => {
                try {
                    await deleteAllUsers()

                    const healthProfessional1: HealthProfessional = new HealthProfessionalMock()
                    healthProfessional1.institution!.id = '5a62be07d6f33400146c9b61'

                    const healthProfessional2: HealthProfessional = new HealthProfessionalMock()
                    healthProfessional2.institution!.id = '5a62be07d6f33400146c9b61'

                    const healthProfessional3: HealthProfessional = new HealthProfessionalMock()
                    healthProfessional3.institution!.id = '5a62be07d6f33400146c9b61'

                    const healthProfessional4: HealthProfessional = new HealthProfessionalMock()
                    healthProfessional4.institution!.id = '5a62be07de34500146d9c544'

                    const healthProfessional5: HealthProfessional = new HealthProfessionalMock()
                    healthProfessional5.institution!.id = '5a62be07de34500146d9c544'

                    const healthProfessional6: HealthProfessional = new HealthProfessionalMock()
                    healthProfessional6.institution!.id = '5a62be07de34500146d9c544'

                    await healthProfRepository.create(healthProfessional1)
                    await healthProfRepository.create(healthProfessional2)
                    await healthProfRepository.create(healthProfessional3)
                    await healthProfRepository.create(healthProfessional4)
                    await healthProfRepository.create(healthProfessional5)
                    await healthProfRepository.create(healthProfessional6)
                } catch (err) {
                    throw new Error('Failure on Provider HealthProfessional test: ' + err.message)
                }
            })
            after(async () => {
                try {
                    await deleteAllUsers()
                } catch (err) {
                    throw new Error('Failure on Provider HealthProfessional test: ' + err.message)
                }
            })
            it('should return an array with six health professionals (regardless of association with an institution)',
                (done) => {
                    rabbitmq.bus.getHealthProfessionals('')
                        .then(result => {
                            expect(result.length).to.eql(6)
                            done()
                        })
                        .catch(done)
                })

            it('should return an empty array (no health professional matches query)', (done) => {
                rabbitmq.bus.getHealthProfessionals('?institution=5a62be07d6f33400146c9b64')
                    .then(result => {
                        expect(result.length).to.eql(0)
                        done()
                    })
                    .catch(done)
            })

            it('should return an array with three health professionals (query all health professionals by institution)',
                (done) => {
                    rabbitmq.bus.getHealthProfessionals('?institution=5a62be07de34500146d9c544')
                        .then(result => {
                            expect(result.length).to.eql(3)
                            done()
                        })
                        .catch(done)
                })
        })

        context('when trying to retrieve health professionals through invalid query', () => {
            before(async () => {
                try {
                    await deleteAllUsers()

                    const healthProfessional: HealthProfessional = new HealthProfessionalMock()
                    healthProfessional.institution!.id = '5a62be07d6f33400146c9b61'

                    await healthProfRepository.create(healthProfessional)
                } catch (err) {
                    throw new Error('Failure on Provider HealthProfessional test: ' + err.message)
                }
            })
            // Delete all health professionals from database after each test case
            after(async () => {
                try {
                    await deleteAllUsers()
                } catch (err) {
                    throw new Error('Failure on Provider HealthProfessional test: ' + err.message)
                }
            })
            it('should return a ValidationException (query with an invalid institution id)', (done) => {
                rabbitmq.bus.getHealthProfessionals('?institution=invalidInstitutionId')
                    .then(result => {
                        expect(result.length).to.eql(0)
                        done(new Error('The find method of the repository should not function normally'))
                    })
                    .catch((err) => {
                        try {
                            expect(err.message).to.eql('Error: '.concat(Strings.ERROR_MESSAGE.UUID_NOT_VALID_FORMAT))
                            done()
                        } catch (err) {
                            done(err)
                        }
                    })
            })

            it('should return a ValidationException (query with an invalid date (last_login))', (done) => {
                rabbitmq.bus.getHealthProfessionals('?last_login=invalidLastLogin')
                    .then(result => {
                        expect(result.length).to.eql(0)
                        done(new Error('The find method of the repository should not function normally'))
                    })
                    .catch((err) => {
                        try {
                            expect(err.message).to.eql('Error: '
                                .concat('Datetime: invalidLastLogin is not in valid ISO 8601 format.'))
                            done()
                        } catch (err) {
                            done(err)
                        }
                    })
            })
        })

        context('when trying to recover health professionals through a query unsuccessful (without MongoDB connection)',
            () => {
                before(async () => {
                    try {
                        await dbConnection.dispose()
                    } catch (err) {
                        throw new Error('Failure on Provider HealthProfessional test: ' + err.message)
                    }
                })
                after(async () => {
                    try {
                        await dbConnection.connect(process.env.MONGODB_URI_TEST || Default.MONGODB_URI_TEST,
                            { interval: 100 })
                    } catch (err) {
                        throw new Error('Failure on Provider HealthProfessional test: ' + err.message)
                    }
                })
                it('should return a rpc timeout error', (done) => {
                    rabbitmq.bus.getHealthProfessionals('?institution=5a62be07d6f33400146c9b61')
                        .then(() => {
                            done(new Error('RPC should not function normally'))
                        })
                        .catch((err) => {
                            try {
                                expect(err.message).to.eql('rpc timed out')
                                done()
                            } catch (err) {
                                done(err)
                            }
                        })
                })
            })
    })

    describe('Provider Application', () => {
        context('when retrieving applications through a query successfully', () => {
            const application: Application = new ApplicationMock()
            application.institution!.id = '5a62be07d6f33400146c9b61'
            before(async () => {
                try {
                    await deleteAllUsers()

                    const applicationCreated = await applicationRepository.create(application)
                    application.id = applicationCreated.id
                } catch (err) {
                    throw new Error('Failure on Provider Application test: ' + err.message)
                }
            })
            // Delete all applications from database after the test cases
            after(async () => {
                try {
                    await deleteAllUsers()
                } catch (err) {
                    throw new Error('Failure on Provider Application test: ' + err.message)
                }
            })
            it('should return an array with one application', (done) => {
                rabbitmq.bus.getApplications('?institution=5a62be07d6f33400146c9b61')
                    .then(result => {
                        expect(result.length).to.eql(1)
                        // Comparing the resources
                        expect(result[0].id).to.eql(application.id)
                        expect(result[0].username).to.eql(application.username)
                        expect(result[0].type).to.eql(application.type)
                        expect(result[0].institution_id).to.eql(application.institution!.id)
                        expect(result[0].last_login).to.eql(application.last_login!.toISOString())
                        expect(result[0].application_name).to.eql(application.application_name)
                        done()
                    })
                    .catch(done)
            })
        })

        context('when retrieving applications through a query successfully when there is at least one matching ' +
            'application', () => {
            before(async () => {
                try {
                    await deleteAllUsers()

                    const application1: Application = new ApplicationMock()
                    application1.institution!.id = '5a62be07d6f33400146c9b61'

                    const application2: Application = new ApplicationMock()
                    application2.institution!.id = '5a62be07d6f33400146c9b61'

                    const application3: Application = new ApplicationMock()
                    application3.institution!.id = '5a62be07d6f33400146c9b61'

                    const application4: Application = new ApplicationMock()
                    application4.institution!.id = '5a62be07de34500146d9c544'

                    const application5: Application = new ApplicationMock()
                    application5.institution!.id = '5a62be07de34500146d9c544'

                    const application6: Application = new ApplicationMock()
                    application6.institution!.id = '5a62be07de34500146d9c544'

                    await applicationRepository.create(application1)
                    await applicationRepository.create(application2)
                    await applicationRepository.create(application3)
                    await applicationRepository.create(application4)
                    await applicationRepository.create(application5)
                    await applicationRepository.create(application6)
                } catch (err) {
                    throw new Error('Failure on Provider Application test: ' + err.message)
                }
            })
            after(async () => {
                try {
                    await deleteAllUsers()
                } catch (err) {
                    throw new Error('Failure on Provider Application test: ' + err.message)
                }
            })
            it('should return an array with six applications (regardless of association with an institution)',
                (done) => {
                    rabbitmq.bus.getApplications('')
                        .then(result => {
                            expect(result.length).to.eql(6)
                            done()
                        })
                        .catch(done)
                })

            it('should return an empty array (no application matches query)', (done) => {
                rabbitmq.bus.getApplications('?institution=5a62be07d6f33400146c9b64')
                    .then(result => {
                        expect(result.length).to.eql(0)
                        done()
                    })
                    .catch(done)
            })

            it('should return an array with three applications (query all applications by institution)',
                (done) => {
                    rabbitmq.bus.getApplications('?institution=5a62be07de34500146d9c544')
                        .then(result => {
                            expect(result.length).to.eql(3)
                            done()
                        })
                        .catch(done)
                })
        })

        context('when trying to retrieve applications through invalid query', () => {
            before(async () => {
                try {
                    await deleteAllUsers()

                    const application: Application = new ApplicationMock()
                    application.institution!.id = '5a62be07d6f33400146c9b61'

                    await applicationRepository.create(application)
                } catch (err) {
                    throw new Error('Failure on Provider Application test: ' + err.message)
                }
            })
            // Delete all applications from database after each test case
            after(async () => {
                try {
                    await deleteAllUsers()
                } catch (err) {
                    throw new Error('Failure on Provider Application test: ' + err.message)
                }
            })
            it('should return a ValidationException (query with an invalid institution id)', (done) => {
                rabbitmq.bus.getApplications('?institution=invalidInstitutionId')
                    .then(result => {
                        expect(result.length).to.eql(0)
                        done(new Error('The find method of the repository should not function normally'))
                    })
                    .catch((err) => {
                        try {
                            expect(err.message).to.eql('Error: '.concat(Strings.ERROR_MESSAGE.UUID_NOT_VALID_FORMAT))
                            done()
                        } catch (err) {
                            done(err)
                        }
                    })
            })

            it('should return a ValidationException (query with an invalid date (last_login))', (done) => {
                rabbitmq.bus.getApplications('?last_login=invalidLastLogin')
                    .then(result => {
                        expect(result.length).to.eql(0)
                        done(new Error('The find method of the repository should not function normally'))
                    })
                    .catch((err) => {
                        try {
                            expect(err.message).to.eql('Error: '
                                .concat('Datetime: invalidLastLogin is not in valid ISO 8601 format.'))
                            done()
                        } catch (err) {
                            done(err)
                        }
                    })
            })
        })

        context('when trying to recover applications through a query unsuccessful (without MongoDB connection)',
            () => {
                before(async () => {
                    try {
                        await dbConnection.dispose()
                    } catch (err) {
                        throw new Error('Failure on Provider Application test: ' + err.message)
                    }
                })
                after(async () => {
                    try {
                        await dbConnection.connect(process.env.MONGODB_URI_TEST || Default.MONGODB_URI_TEST,
                            { interval: 100 })
                    } catch (err) {
                        throw new Error('Failure on Provider Application test: ' + err.message)
                    }
                })
                it('should return a rpc timeout error', (done) => {
                    rabbitmq.bus.getApplications('?institution=5a62be07d6f33400146c9b61')
                        .then(() => {
                            done(new Error('RPC should not function normally'))
                        })
                        .catch((err) => {
                            try {
                                expect(err.message).to.eql('rpc timed out')
                                done()
                            } catch (err) {
                                done(err)
                            }
                        })
                })
            })
    })

    describe('Provider Institution', () => {
        context('when retrieving institutions through a query successfully', () => {
            const institution: Institution = new InstitutionMock()
            before(async () => {
                try {
                    await deleteAllInstitutions()

                    const institutionCreated = await institutionRepository.create(institution)
                    institution.id = institutionCreated.id
                } catch (err) {
                    throw new Error('Failure on Provider Institution test: ' + err.message)
                }
            })
            // Delete all institutions from database after the test cases
            after(async () => {
                try {
                    await deleteAllInstitutions()
                } catch (err) {
                    throw new Error('Failure on Provider Institution test: ' + err.message)
                }
            })
            it('should return an array with one institution', (done) => {
                rabbitmq.bus.getInstitutions('')
                    .then(result => {
                        expect(result.length).to.eql(1)
                        // Comparing the resources
                        expect(result[0].id).to.eql(institution.id)
                        expect(result[0].type).to.eql(institution.type)
                        expect(result[0].name).to.eql(institution.name)
                        expect(result[0].address).to.eql(institution.address)
                        expect(result[0].latitude).to.eql(institution.latitude)
                        expect(result[0].longitude).to.eql(institution.longitude)
                        done()
                    })
                    .catch(done)
            })
        })

        context('when retrieving institutions through a query successfully when there is at least one matching ' +
            'institution', () => {
            before(async () => {
                try {
                    await deleteAllInstitutions()

                    const institution1: Institution = new InstitutionMock()
                    institution1.name = 'NUTES'
                    institution1.address = 'R. Baraunas 351'

                    const institution2: Institution = new InstitutionMock()
                    institution2.name = 'UEPB'
                    institution2.address = 'R. Baraunas 351'

                    const institution3: Institution = new InstitutionMock()
                    institution3.type = 'Example Type'

                    await institutionRepository.create(institution1)
                    await institutionRepository.create(institution2)
                    await institutionRepository.create(institution3)
                } catch (err) {
                    throw new Error('Failure on Provider Institution test: ' + err.message)
                }
            })
            after(async () => {
                try {
                    await deleteAllInstitutions()
                } catch (err) {
                    throw new Error('Failure on Provider Institution test: ' + err.message)
                }
            })
            it('should return an array with three institutions (query all institutions)',
                (done) => {
                    rabbitmq.bus.getInstitutions('')
                        .then(result => {
                            expect(result.length).to.eql(3)
                            done()
                        })
                        .catch(done)
                })

            it('should return an empty array (no institution matches query)', (done) => {
                rabbitmq.bus.getInstitutions('?id=5a62be07de34500146d9c544')
                    .then(result => {
                        expect(result.length).to.eql(0)
                        done()
                    })
                    .catch(done)
            })

            it('should return an array with two institutions (query institutions by type)', (done) => {
                rabbitmq.bus.getInstitutions('?type=Institute of Scientific Research')
                    .then(result => {
                        expect(result.length).to.eql(2)
                        done()
                    })
                    .catch(done)
            })

            it('should return an array with two institutions (query institutions by address)', (done) => {
                rabbitmq.bus.getInstitutions('?address=R. Baraunas 351')
                    .then(result => {
                        expect(result.length).to.eql(2)
                        done()
                    })
                    .catch(done)
            })
        })

        context('when trying to retrieve institutions through invalid query', () => {
            before(async () => {
                try {
                    await deleteAllInstitutions()

                    const institution: Institution = new InstitutionMock()

                    await institutionRepository.create(institution)
                } catch (err) {
                    throw new Error('Failure on Provider Institution test: ' + err.message)
                }
            })
            // Delete all institutions from database after each test case
            after(async () => {
                try {
                    await deleteAllInstitutions()
                } catch (err) {
                    throw new Error('Failure on Provider Institution test: ' + err.message)
                }
            })
            it('should return a ValidationException (query with an invalid number)', (done) => {
                rabbitmq.bus.getInstitutions('?latitude=invalidLatitude')
                    .then(result => {
                        expect(result.length).to.eql(0)
                        done(new Error('The find method of the repository should not function normally'))
                    })
                    .catch((err) => {
                        try {
                            expect(err.message).to.eql('Error: '
                                .concat('The value \'invalidLatitude\' of latitude field is not a number.'))
                            done()
                        } catch (err) {
                            done(err)
                        }
                    })
            })

            it('should return a ValidationException (query with an invalid number))', (done) => {
                rabbitmq.bus.getInstitutions('?longitude=invalidLongitude')
                    .then(result => {
                        expect(result.length).to.eql(0)
                        done(new Error('The find method of the repository should not function normally'))
                    })
                    .catch((err) => {
                        try {
                            expect(err.message).to.eql('Error: '
                                .concat('The value \'invalidLongitude\' of longitude field is not a number.'))
                            done()
                        } catch (err) {
                            done(err)
                        }
                    })
            })
        })

        context('when trying to recover institutions through a query unsuccessful (without MongoDB connection)',
            () => {
                before(async () => {
                    try {
                        await dbConnection.dispose()
                    } catch (err) {
                        throw new Error('Failure on Provider Institution test: ' + err.message)
                    }
                })
                after(async () => {
                    try {
                        await dbConnection.connect(process.env.MONGODB_URI_TEST || Default.MONGODB_URI_TEST,
                            { interval: 100 })
                    } catch (err) {
                        throw new Error('Failure on Provider Institution test: ' + err.message)
                    }
                })
                it('should return a rpc timeout error', (done) => {
                    rabbitmq.bus.getInstitutions('?id=5a62be07de34500146d9c544')
                        .then(() => {
                            done(new Error('RPC should not function normally'))
                        })
                        .catch((err) => {
                            try {
                                expect(err.message).to.eql('rpc timed out')
                                done()
                            } catch (err) {
                                done(err)
                            }
                        })
                })
            })
    })
})

async function deleteAllUsers() {
    return UserRepoModel.deleteMany({})
}

async function deleteAllInstitutions() {
    return InstitutionRepoModel.deleteMany({})
}
