import { Router, Request, Response } from 'express'
import { IRouter } from './router.interface'
import usersRouter from './user.router'
import config from '../../config/config'

/**
 * Class that defines the general routes of the API and redirects
 * for each Router to define its own routes.
 * 
 * @author Douglas Rafael <douglas.rafael@nutes.uepb.edu.br>
 */
class IndexRouter implements IRouter<any> {
    router: Router

    constructor() {
        this.router = Router()
        this.initialize()
    }

    /**
     * Initialize routes
     */
    initialize(): void {
        // Readme
        this.router.get('/', (req: Request, res: Response) => res.send(this.readme()))
        this.router.get('/api/v1', (req: Request, res: Response) => res.send(this.readme()))

        // Resource users
        this.router.use('/api/v1/users', usersRouter);
    }

    /**
     * Returns the API presentation message.
     * 
     * @returns String
     */
    readme(): String {
        return `<h2> 'Account Service - <small>Microservice for user management.'.</small></h2>
        <p>Access the API documentation <a href="/api/v1/reference">v.1.0</a></p>`
    }
}

export default new IndexRouter().router