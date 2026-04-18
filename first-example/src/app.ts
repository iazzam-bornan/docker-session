import express from 'express';
import path from 'path';
import routes from '@/routes';
import { errorHandler } from '@/middlewares/errorHandler';
import { notFound } from '@/middlewares/notFound';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/css', express.static(path.join(process.cwd(), 'public', 'css')));
app.use('/js', express.static(path.join(process.cwd(), 'public', 'js')));

app.use(routes);

app.use(notFound);
app.use(errorHandler);

export default app;