import { Institution } from '../../../src/application/domain/model/institution'
import { UserType } from '../../../src/application/domain/model/user'
import { UserRepoModel } from '../../../src/infrastructure/database/schema/user.schema'
import { InstitutionRepoModel } from '../../../src/infrastructure/database/schema/institution.schema'
import { DIContainer } from '../../../src/di/di'
import { Identifier } from '../../../src/di/identifiers'
import { App } from '../../../src/app'
import { Child } from '../../../src/application/domain/model/child'
import { expect } from 'chai'
import { ObjectID } from 'bson'
import { ChildMock } from '../../mocks/child.mock'
import { Strings } from '../../../src/utils/strings'
import { IDatabase } from '../../../src/infrastructure/port/database.interface'
import { Default } from '../../../src/utils/default'
import { IEventBus } from '../../../src/infrastructure/port/eventbus.interface'

const dbConnection: IDatabase = DIContainer.get(Identifier.MONGODB_CONNECTION)
const rabbitmq: IEventBus = DIContainer.get(Identifier.RABBITMQ_EVENT_BUS)
const app: App = DIContainer.get(Identifier.APP)
const request = require('supertest')(app.getExpress())

describe('Routes: Child', () => {
    const institution: Institution = new Institution()

    const defaultChild: Child = new ChildMock()

    before(async () => {
            try {
                await dbConnection.connect(process.env.MONGODB_URI_TEST || Default.MONGODB_URI_TEST,
                    { interval: 100 })

                await rabbitmq.initialize('amqp://invalidUser:guest@localhost', { retries: 1, interval: 100 })

                await deleteAllUsers()
                await deleteAllInstitutions()

                const item = await createInstitution({
                    type: 'Any Type',
                    name: 'Name Example',
                    address: '221B Baker Street, St.',
                    latitude: 0,
                    longitude: 0
                })
                institution.id = item._id.toString()

            } catch (err) {
                throw new Error('Failure on Child test: ' + err.message)
            }
        }
    )

    after(async () => {
        try {
            await deleteAllUsers()
            await deleteAllInstitutions()
            await dbConnection.dispose()
            await rabbitmq.dispose()
        } catch (err) {
            throw new Error('Failure on Child test: ' + err.message)
        }
    })

    describe('RABBITMQ PUBLISHER -> POST /v1/children', () => {
        context('when posting a new child user and publishing it to the bus', () => {
            before(async () => {
                try {
                    await deleteAllUsers()

                    await rabbitmq.initialize(process.env.RABBITMQ_URI || Default.RABBITMQ_URI,
                        { interval: 100, receiveFromYourself: true, sslOptions: { ca: [] } })
                } catch (err) {
                    throw new Error('Failure on Child test: ' + err.message)
                }
            })

            after(async () => {
                try {
                    await rabbitmq.dispose()
                    await rabbitmq.initialize('amqp://invalidUser:guest@localhost', { retries: 1, interval: 100 })
                } catch (err) {
                    throw new Error('Failure on Child test: ' + err.message)
                }
            })

            it('The subscriber should receive a message in the correct format and with the same values as the child ' +
                'published on the bus', (done) => {
                rabbitmq.bus
                    .subSaveChild(message => {
                        try {
                            expect(message.event_name).to.eql('ChildSaveEvent')
                            expect(message).to.have.property('timestamp')
                            expect(message).to.have.property('child')
                            expect(message.child).to.have.property('id')
                            expect(message.child.username).to.eql(defaultChild.username)
                            expect(message.child.gender).to.eql(defaultChild.gender)
                            expect(message.child.age).to.eql(defaultChild.age)
                            expect(message.child.institution_id).to.eql(institution.id)
                            done()
                        } catch (err) {
                            done(err)
                        }
                    })
                    .then(() => {
                        request
                            .post('/v1/children')
                            .send({
                                username: defaultChild.username,
                                password: defaultChild.password,
                                gender: defaultChild.gender,
                                age: defaultChild.age,
                                institution_id: institution.id
                            })
                            .set('Content-Type', 'application/json')
                            .expect(201)
                            .then()
                            .catch(done)
                    })
                    .catch(done)
            })
        })
    })

    describe('POST /v1/children', () => {
        context('when posting a new child user (there is no connection to RabbitMQ)', () => {
            before(async () => {
                try {
                    await deleteAllUsers()
                } catch (err) {
                    throw new Error('Failure on Child test: ' + err.message)
                }
            })
            it('should return status code 201 and the saved child (and show an error log about unable to send ' +
                'SaveChild event)', () => {
                const body = {
                    username: defaultChild.username,
                    password: defaultChild.password,
                    gender: defaultChild.gender,
                    age: defaultChild.age,
                    institution_id: institution.id
                }

                return request
                    .post('/v1/children')
                    .send(body)
                    .set('Content-Type', 'application/json')
                    .expect(201)
                    .then(res => {
                        expect(res.body).to.have.property('id')
                        expect(res.body.username).to.eql(defaultChild.username)
                        expect(res.body.gender).to.eql(defaultChild.gender)
                        expect(res.body.age).to.eql(defaultChild.age)
                        expect(res.body.institution_id).to.eql(institution.id)
                    })
            })
        })

        context('when a duplicate error occurs', () => {
            before(async () => {
                try {
                    await deleteAllUsers()

                    await createUser({
                        username: defaultChild.username,
                        password: defaultChild.password,
                        type: UserType.CHILD,
                        gender: defaultChild.gender,
                        age: defaultChild.age,
                        institution: new ObjectID(institution.id)
                    })
                } catch (err) {
                    throw new Error('Failure on Child test: ' + err.message)
                }
            })
            it('should return status code 409 and message info about duplicate items', () => {
                const body = {
                    username: defaultChild.username,
                    password: defaultChild.password,
                    gender: defaultChild.gender,
                    age: defaultChild.age,
                    institution_id: institution.id
                }

                return request
                    .post('/v1/children')
                    .send(body)
                    .set('Content-Type', 'application/json')
                    .expect(409)
                    .then(err => {
                        expect(err.body.message).to.eql(Strings.CHILD.ALREADY_REGISTERED)
                    })
            })
        })

        context('when a validation error occurs', () => {
            it('should return status code 400 and message info about missing or invalid parameters', () => {
                const body = {}

                return request
                    .post('/v1/children')
                    .send(body)
                    .set('Content-Type', 'application/json')
                    .expect(400)
                    .then(err => {
                        expect(err.body.message).to.eql(Strings.ERROR_MESSAGE.REQUIRED_FIELDS)
                        expect(err.body.description).to.eql('username, password, institution, gender, ' +
                            'age'.concat(Strings.ERROR_MESSAGE.REQUIRED_FIELDS_DESC))
                    })
            })
        })

        context('when the institution provided does not exists', () => {
            it('should return status code 400 and message for institution not found', () => {
                const body = {
                    username: 'anotherusername',
                    password: defaultChild.password,
                    gender: defaultChild.gender,
                    age: defaultChild.age,
                    institution_id: new ObjectID()
                }

                return request
                    .post('/v1/children')
                    .send(body)
                    .set('Content-Type', 'application/json')
                    .expect(400)
                    .then(err => {
                        expect(err.body.message).to.eql(Strings.INSTITUTION.REGISTER_REQUIRED)
                        expect(err.body.description).to.eql(Strings.INSTITUTION.ALERT_REGISTER_REQUIRED)
                    })
            })
        })

        context('when the institution id provided was invalid', () => {
            it('should return status code 400 and message for invalid institution id', () => {
                const body = {
                    username: 'anotherusername',
                    password: defaultChild.password,
                    gender: defaultChild.gender,
                    age: defaultChild.age,
                    institution_id: '123'
                }

                return request
                    .post('/v1/children')
                    .send(body)
                    .set('Content-Type', 'application/json')
                    .expect(400)
                    .then(err => {
                        expect(err.body.message).to.eql(Strings.INSTITUTION.PARAM_ID_NOT_VALID_FORMAT)
                        expect(err.body.description).to.eql(Strings.ERROR_MESSAGE.UUID_NOT_VALID_FORMAT_DESC)
                    })
            })
        })

        context('when the name provided is invalid', () => {
            it('should return status code 400 and message for invalid name', () => {
                const body = {
                    username: '',
                    password: defaultChild.password,
                    gender: defaultChild.gender,
                    age: defaultChild.age,
                    institution_id: institution.id
                }

                return request
                    .post('/v1/children')
                    .send(body)
                    .set('Content-Type', 'application/json')
                    .expect(400)
                    .then(err => {
                        expect(err.body.message).to.eql(Strings.ERROR_MESSAGE.INVALID_FIELDS)
                        expect(err.body.description).to.eql('username must have at least one character!')
                    })
            })
        })

        context('when the password provided is invalid', () => {
            it('should return status code 400 and message for invalid password', () => {
                const body = {
                    username: defaultChild.username,
                    password: '',
                    gender: defaultChild.gender,
                    age: defaultChild.age,
                    institution_id: institution.id
                }

                return request
                    .post('/v1/children')
                    .send(body)
                    .set('Content-Type', 'application/json')
                    .expect(400)
                    .then(err => {
                        expect(err.body.message).to.eql(Strings.ERROR_MESSAGE.INVALID_FIELDS)
                        expect(err.body.description).to.eql('password must have at least one character!')
                    })
            })
        })

        context('when the gender provided is invalid', () => {
            it('should return status code 400 and message for invalid gender', () => {
                const body = {
                    username: 'anotherusername',
                    password: defaultChild.password,
                    gender: 'invalid_gender',
                    age: defaultChild.age,
                    institution_id: institution.id
                }

                return request
                    .post('/v1/children')
                    .send(body)
                    .set('Content-Type', 'application/json')
                    .expect(400)
                    .then(err => {
                        expect(err.body.message).to.eql(Strings.ERROR_MESSAGE.INVALID_FIELDS)
                        expect(err.body.description).to.eql('The names of the allowed genders are: male, female.')
                    })
            })
        })

        context('when the age provided is invalid', () => {
            it('should return status code 400 and message for invalid age', () => {

                const body = {
                    username: 'anotherusername',
                    password: defaultChild.password,
                    gender: defaultChild.gender,
                    age: `${defaultChild.age}a`,
                    institution_id: institution.id
                }

                return request
                    .post('/v1/children')
                    .send(body)
                    .set('Content-Type', 'application/json')
                    .expect(400)
                    .then(err => {
                        expect(err.body.message).to.eql(Strings.ERROR_MESSAGE.INVALID_FIELDS)
                        expect(err.body.description).to.eql(
                            'Provided age is not a valid number!')
                    })
            })
        })

        context('when the age provided is negative', () => {
            it('should return status code 400 and message for invalid age', () => {

                const body = {
                    username: 'anotherusername',
                    password: defaultChild.password,
                    gender: defaultChild.gender,
                    age: -1,
                    institution_id: institution.id
                }

                return request
                    .post('/v1/children')
                    .send(body)
                    .set('Content-Type', 'application/json')
                    .expect(400)
                    .then(err => {
                        expect(err.body.message).to.eql(Strings.ERROR_MESSAGE.INVALID_FIELDS)
                        expect(err.body.description).to.eql(
                            'Age cannot be less than or equal to zero!')
                    })
            })
        })
    })

    describe('GET /v1/children/:child_id', () => {
        context('when get an unique child in database', () => {
            let result

            before(async () => {
                try {
                    await deleteAllUsers()

                    result = await createUser({
                        username: defaultChild.username,
                        password: defaultChild.password,
                        type: UserType.CHILD,
                        gender: defaultChild.gender,
                        age: defaultChild.age,
                        institution: new ObjectID(institution.id)
                    })
                } catch (err) {
                    throw new Error('Failure on Child test: ' + err.message)
                }
            })
            it('should return status code 200 and a child', () => {
                return request
                    .get(`/v1/children/${result.id}`)
                    .set('Content-Type', 'application/json')
                    .expect(200)
                    .then(res => {
                        expect(res.body).to.have.property('id')
                        expect(res.body.username).to.eql(defaultChild.username)
                        expect(res.body.gender).to.eql(defaultChild.gender)
                        expect(res.body.age).to.eql(defaultChild.age)
                        expect(res.body.institution_id).to.eql(institution.id)
                    })
            })
        })

        context('when the child is not found', () => {
            before(async () => {
                try {
                    await deleteAllUsers()
                } catch (err) {
                    throw new Error('Failure on Child test: ' + err.message)
                }
            })
            it('should return status code 404 and info message from child not found', () => {
                return request
                    .get(`/v1/children/${new ObjectID()}`)
                    .set('Content-Type', 'application/json')
                    .expect(404)
                    .then(err => {
                        expect(err.body.message).to.eql(Strings.CHILD.NOT_FOUND)
                        expect(err.body.description).to.eql(Strings.CHILD.NOT_FOUND_DESCRIPTION)
                    })
            })
        })

        context('when the child_id is invalid', () => {
            it('should return status code 400 and message info about invalid id', () => {
                return request
                    .get('/v1/children/123')
                    .set('Content-Type', 'application/json')
                    .expect(400)
                    .then(err => {
                        expect(err.body.message).to.eql(Strings.CHILD.PARAM_ID_NOT_VALID_FORMAT)
                        expect(err.body.description).to.eql(Strings.ERROR_MESSAGE.UUID_NOT_VALID_FORMAT_DESC)
                    })
            })
        })
    })

    describe('RABBITMQ PUBLISHER -> PATCH /v1/children/:child_id', () => {
        context('when this child is updated successfully and published to the bus', () => {
            let result

            before(async () => {
                try {
                    await deleteAllUsers()

                    result = await createUser({
                        username: defaultChild.username,
                        password: defaultChild.password,
                        type: UserType.CHILD,
                        gender: defaultChild.gender,
                        age: defaultChild.age,
                        institution: new ObjectID(institution.id)
                    })

                    await rabbitmq.initialize(process.env.RABBITMQ_URI || Default.RABBITMQ_URI,
                        { interval: 100, receiveFromYourself: true, sslOptions: { ca: [] } })
                } catch (err) {
                    throw new Error('Failure on Child test: ' + err.message)
                }
            })

            after(async () => {
                try {
                    await rabbitmq.dispose()
                    await rabbitmq.initialize('amqp://invalidUser:guest@localhost', { retries: 1, interval: 100 })
                } catch (err) {
                    throw new Error('Failure on Child test: ' + err.message)
                }
            })

            it('The subscriber should receive a message in the correct format and with the same values as the child ' +
                'published on the bus', (done) => {
                rabbitmq.bus
                    .subUpdateChild(message => {
                        try {
                            expect(message.event_name).to.eql('ChildUpdateEvent')
                            expect(message).to.have.property('timestamp')
                            expect(message).to.have.property('child')
                            expect(message.child).to.have.property('id')
                            expect(message.child.username).to.eql('new_username')
                            expect(message.child.gender).to.eql(defaultChild.gender)
                            expect(message.child.age).to.eql(defaultChild.age)
                            expect(message.child.institution_id).to.eql(institution.id)
                            done()
                        } catch (err) {
                            done(err)
                        }
                    })
                    .then(() => {
                        request
                            .patch(`/v1/children/${result.id}`)
                            .send({ username: 'new_username' })
                            .set('Content-Type', 'application/json')
                            .expect(200)
                            .then()
                            .catch(done)
                    })
                    .catch(done)
            })
        })
    })

    describe('PATCH /v1/children/:child_id', () => {
        context('when the update was successful (there is no connection to RabbitMQ)', () => {
            let result

            before(async () => {
                try {
                    await deleteAllUsers()

                    result = await createUser({
                        username: defaultChild.username,
                        password: defaultChild.password,
                        type: UserType.CHILD,
                        gender: defaultChild.gender,
                        age: defaultChild.age,
                        institution: new ObjectID(institution.id)
                    })
                } catch (err) {
                    throw new Error('Failure on Child test: ' + err.message)
                }
            })
            it('should return status code 200 and updated child (and show an error log about unable to send ' +
                'UpdateChild event)', () => {
                return request
                    .patch(`/v1/children/${result.id}`)
                    .send({
                        username: 'other_username', last_login: defaultChild.last_login,
                        last_sync: defaultChild.last_sync
                    })
                    .set('Content-Type', 'application/json')
                    .expect(200)
                    .then(res => {
                        expect(res.body).to.have.property('id')
                        expect(res.body.username).to.eql('other_username')
                        expect(res.body.gender).to.eql(defaultChild.gender)
                        expect(res.body.age).to.eql(defaultChild.age)
                        expect(res.body.institution_id).to.eql(institution.id)
                    })
            })
        })

        context('when a duplication error occurs', () => {
            let result

            before(async () => {
                try {
                    await deleteAllUsers()

                    await createUser({
                        username: 'anothercoolusername',
                        password: defaultChild.password,
                        type: UserType.CHILD,
                        gender: defaultChild.gender,
                        age: defaultChild.age,
                        institution: new ObjectID(institution.id)
                    })

                    result = await createUser({
                        username: defaultChild.username,
                        password: defaultChild.password,
                        type: UserType.CHILD,
                        gender: defaultChild.gender,
                        age: defaultChild.age,
                        institution: new ObjectID(institution.id)
                    })
                } catch (err) {
                    throw new Error('Failure on Child test: ' + err.message)
                }
            })
            it('should return status code 409 and info message from duplicate value', () => {
                return request
                    .patch(`/v1/children/${result.id}`)
                    .send({ username: 'anothercoolusername' })
                    .set('Content-Type', 'application/json')
                    .expect(409)
                    .then(err => {
                        expect(err.body.message).to.eql(Strings.CHILD.ALREADY_REGISTERED)
                    })
            })
        })

        context('when a validation error occurs', () => {
            it('should return status code 400 and message info about missing or invalid parameters', () => {
                const body = {
                    password: 'mysecretkey'
                }

                return request
                    .patch(`/v1/children/${defaultChild.id}`)
                    .send(body)
                    .set('Content-Type', 'application/json')
                    .expect(400)
                    .then(err => {
                        expect(err.body.message).to.eql('This parameter could not be updated.')
                        expect(err.body.description).to.eql('A specific route to update user password already exists.' +
                            `Access: PATCH /users/${defaultChild.id}/password to update your password.`)
                    })
            })
        })

        context('when the institution provided does not exists', () => {
            it('should return status code 400 and message for institution not found', () => {
                return request
                    .patch(`/v1/children/${defaultChild.id}`)
                    .send({ institution_id: new ObjectID() })
                    .set('Content-Type', 'application/json')
                    .expect(400)
                    .then(err => {
                        expect(err.body.message).to.eql(Strings.INSTITUTION.REGISTER_REQUIRED)
                        expect(err.body.description).to.eql(Strings.INSTITUTION.ALERT_REGISTER_REQUIRED)
                    })
            })
        })

        context('when the institution id provided was invalid', () => {
            it('should return status code 400 and message for invalid institution id', () => {
                return request
                    .patch(`/v1/children/${defaultChild.id}`)
                    .send({ institution_id: '123' })
                    .set('Content-Type', 'application/json')
                    .expect(400)
                    .then(err => {
                        expect(err.body.message).to.eql(Strings.INSTITUTION.PARAM_ID_NOT_VALID_FORMAT)
                        expect(err.body.description).to.eql(Strings.ERROR_MESSAGE.UUID_NOT_VALID_FORMAT_DESC)
                    })
            })
        })

        context('when the child is not found', () => {
            before(async () => {
                try {
                    await deleteAllUsers()
                } catch (err) {
                    throw new Error('Failure on Child test: ' + err.message)
                }
            })
            it('should return status code 404 and info message from child not found', () => {
                return request
                    .patch(`/v1/children/${new ObjectID()}`)
                    .send({})
                    .set('Content-Type', 'application/json')
                    .expect(404)
                    .then(err => {
                        expect(err.body.message).to.eql(Strings.CHILD.NOT_FOUND)
                        expect(err.body.description).to.eql(Strings.CHILD.NOT_FOUND_DESCRIPTION)
                    })
            })
        })

        context('when the child_id is invalid', () => {
            it('should return status code 400 and info message from invalid id', () => {
                return request
                    .patch('/v1/children/123')
                    .send({})
                    .set('Content-Type', 'application/json')
                    .expect(400)
                    .then(err => {
                        expect(err.body.message).to.eql(Strings.CHILD.PARAM_ID_NOT_VALID_FORMAT)
                        expect(err.body.description).to.eql(Strings.ERROR_MESSAGE.UUID_NOT_VALID_FORMAT_DESC)
                    })
            })
        })

        context('when the username is invalid', () => {
            it('should return status code 400 and info message from invalid username', () => {
                return request
                    .patch(`/v1/children/${defaultChild.id}`)
                    .send({ username: '' })
                    .set('Content-Type', 'application/json')
                    .expect(400)
                    .then(err => {
                        expect(err.body.message).to.eql(Strings.ERROR_MESSAGE.INVALID_FIELDS)
                        expect(err.body.description).to.eql('username must have at least one character!')
                    })
            })
        })

        context('when the gender is invalid', () => {
            it('should return status code 400 and info message from invalid age', () => {
                return request
                    .patch(`/v1/children/${defaultChild.id}`)
                    .send({ gender: 'invalidGender' })
                    .set('Content-Type', 'application/json')
                    .expect(400)
                    .then(err => {
                        expect(err.body.message).to.eql(Strings.ERROR_MESSAGE.INVALID_FIELDS)
                        expect(err.body.description).to.eql('The names of the allowed genders are: male, female.')
                    })
            })
        })

        context('when the age is negative', () => {
            it('should return status code 400 and info message from invalid age', () => {
                return request
                    .patch(`/v1/children/${defaultChild.id}`)
                    .send({ age: -1 })
                    .set('Content-Type', 'application/json')
                    .expect(400)
                    .then(err => {
                        expect(err.body.message).to.eql(Strings.ERROR_MESSAGE.INVALID_FIELDS)
                        expect(err.body.description).to.eql('Age cannot be less than or equal to zero!')
                    })
            })
        })

        context('when the age is invalid', () => {
            it('should return status code 400 and info message from invalid age', () => {
                return request
                    .patch(`/v1/children/${defaultChild.id}`)
                    .send({ age: `${defaultChild.age}a` })
                    .set('Content-Type', 'application/json')
                    .expect(400)
                    .then(err => {
                        expect(err.body.message).to.eql(Strings.ERROR_MESSAGE.INVALID_FIELDS)
                        expect(err.body.description).to.eql('Provided age is not a valid number!')
                    })
            })
        })

        context('when the age is negative', () => {
            it('should return status code 400 and info message from invalid age', () => {
                return request
                    .patch(`/v1/children/${defaultChild.id}`)
                    .send({ age: -1 })
                    .set('Content-Type', 'application/json')
                    .expect(400)
                    .then(err => {
                        expect(err.body.message).to.eql(Strings.ERROR_MESSAGE.INVALID_FIELDS)
                        expect(err.body.description).to.eql('Age cannot be less than or equal to zero!')
                    })
            })
        })
    })

    describe('GET /v1/children', () => {
        context('when want get all children in database', () => {
            before(async () => {
                try {
                    await deleteAllUsers()

                    await createUser({
                        username: 'BR0002',
                        password: defaultChild.password,
                        type: UserType.CHILD,
                        gender: defaultChild.gender,
                        age: defaultChild.age,
                        institution: new ObjectID(institution.id)
                    })

                    await createUser({
                        username: 'BR0003',
                        password: defaultChild.password,
                        type: UserType.CHILD,
                        gender: defaultChild.gender,
                        age: defaultChild.age,
                        institution: new ObjectID(institution.id)
                    })

                    await createUser({
                        username: 'EU0001',
                        password: defaultChild.password,
                        type: UserType.CHILD,
                        gender: defaultChild.gender,
                        age: defaultChild.age,
                        institution: new ObjectID(institution.id)
                    })

                    await createUser({
                        username: 'BR0001',
                        password: defaultChild.password,
                        type: UserType.CHILD,
                        gender: defaultChild.gender,
                        age: defaultChild.age,
                        institution: new ObjectID(institution.id)
                    })
                } catch (err) {
                    throw new Error('Failure on Child test: ' + err.message)
                }
            })
            it('should return status code 200 and a list of children', () => {
                return request
                    .get('/v1/children')
                    .set('Content-Type', 'application/json')
                    .expect(200)
                    .then(res => {
                        expect(res.body.length).to.eql(4)
                        for (const child of res.body) {
                            expect(child).to.have.property('id')
                            expect(child).to.have.property('username')
                            expect(child).to.have.property('institution_id')
                            expect(child).to.have.property('gender')
                            expect(child).to.have.property('age')
                        }
                    })
            })
        })

        context('when use query strings', () => {
            before(async () => {
                try {
                    await deleteAllUsers()

                    await createUser({
                        username: 'BR0002',
                        password: defaultChild.password,
                        type: UserType.CHILD,
                        gender: defaultChild.gender,
                        age: defaultChild.age,
                        institution: new ObjectID(institution.id)
                    })

                    await createUser({
                        username: 'br0003',
                        password: defaultChild.password,
                        type: UserType.CHILD,
                        gender: defaultChild.gender,
                        age: defaultChild.age,
                        institution: new ObjectID(institution.id)
                    })

                    await createUser({
                        username: 'EU0001',
                        password: defaultChild.password,
                        type: UserType.CHILD,
                        gender: defaultChild.gender,
                        age: defaultChild.age,
                        institution: new ObjectID(institution.id)
                    })

                    await createUser({
                        username: 'BR0001',
                        password: defaultChild.password,
                        type: UserType.CHILD,
                        gender: defaultChild.gender,
                        age: defaultChild.age,
                        institution: new ObjectID(institution.id)
                    })
                } catch (err) {
                    throw new Error('Failure on Child test: ' + err.message)
                }
            })
            it('should return the result as required in query (query a maximum of three children who have a certain ' +
                'string at the beginning of their username)', () => {
                const url = '/v1/children?username=EU*&sort=username&page=1&limit=3'
                return request
                    .get(url)
                    .set('Content-Type', 'application/json')
                    .expect(200)
                    .then(res => {
                        expect(res.body.length).to.eql(1)
                        expect(res.body[0]).to.have.property('id')
                        expect(res.body[0].username).to.eql('EU0001')
                        expect(res.body[0].institution_id).to.eql(institution.id)
                        expect(res.body[0].gender).to.eql(defaultChild.gender)
                        expect(res.body[0].age).to.eql(defaultChild.age)
                    })
            })

            it('should return the result as required in query (query a maximum of three children who have a certain ' +
                'string at the end of their username)', () => {
                const url = '/v1/children?username=*2&sort=username&page=1&limit=3'
                return request
                    .get(url)
                    .set('Content-Type', 'application/json')
                    .expect(200)
                    .then(res => {
                        expect(res.body.length).to.eql(1)
                        expect(res.body[0]).to.have.property('id')
                        expect(res.body[0].username).to.eql('BR0002')
                        expect(res.body[0].institution_id).to.eql(institution.id)
                        expect(res.body[0].gender).to.eql(defaultChild.gender)
                        expect(res.body[0].age).to.eql(defaultChild.age)
                    })
            })

            it('should return the result as required in query (query a maximum of two children who have a particular ' +
                'string anywhere in their username, sorted in descending order by this username)', () => {
                const url = '/v1/children?username=*BR*&sort=-username&page=1&limit=2'
                return request
                    .get(url)
                    .set('Content-Type', 'application/json')
                    .expect(200)
                    .then(res => {
                        expect(res.body.length).to.eql(2)
                        // Tests if the ordination was applied correctly
                        expect(res.body[0].username).to.eql('br0003')
                        expect(res.body[1].username).to.eql('BR0002')
                        for (const child of res.body) {
                            expect(child).to.have.property('id')
                            expect(child).to.have.property('username')
                            expect(child).to.have.property('institution_id')
                            expect(child).to.have.property('gender')
                            expect(child).to.have.property('age')
                        }
                    })
            })

            it('should return the result as required in query (query the child that has username exactly the same as the ' +
                'given string)', () => {
                const url = '/v1/children?username=br0003&sort=username&page=1&limit=2'
                return request
                    .get(url)
                    .set('Content-Type', 'application/json')
                    .expect(200)
                    .then(res => {
                        expect(res.body.length).to.eql(1)
                        expect(res.body[0]).to.have.property('id')
                        expect(res.body[0].username).to.eql('br0003')
                        expect(res.body[0].institution_id).to.eql(institution.id)
                        expect(res.body[0].gender).to.eql(defaultChild.gender)
                        expect(res.body[0].age).to.eql(defaultChild.age)
                    })
            })

            it('should return an empty array (when not find any child)', () => {
                const url = '/v1/children?username=*PB*&sort=username&page=1&limit=3'
                return request
                    .get(url)
                    .set('Content-Type', 'application/json')
                    .expect(200)
                    .then(res => {
                        expect(res.body.length).to.eql(0)
                    })
            })
        })

        context('when there are no children in the database', () => {
            before(async () => {
                try {
                    await deleteAllUsers()
                } catch (err) {
                    throw new Error('Failure on Child test: ' + err.message)
                }
            })
            it('should return status code 200 and an empty array', () => {
                return request
                    .get('/v1/children')
                    .set('Content-Type', 'application/json')
                    .expect(200)
                    .then(res => {
                        expect(res.body.length).to.eql(0)
                    })
            })
        })
    })
})

async function createUser(item) {
    return UserRepoModel.create(item)
}

async function deleteAllUsers() {
    return UserRepoModel.deleteMany({})
}

async function createInstitution(item) {
    return InstitutionRepoModel.create(item)
}

async function deleteAllInstitutions() {
    return InstitutionRepoModel.deleteMany({})
}
