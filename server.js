import express from 'express';
import Database from 'better-sqlite3';

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  return res.status(200).send({'message': 'SHIPTIVITY API. Read documentation to see API docs'});
});

// We are keeping one connection alive for the rest of the life application for simplicity
const db = new Database('./clients.db');

// Don't forget to close connection when server gets terminated
const closeDb = () => db.close();
process.on('SIGTERM', closeDb);
process.on('SIGINT', closeDb);

/**
 * Validate id input
 * @param {any} id
 */
const validateId = (id) => {
  if (Number.isNaN(id)) {
    return {
      valid: false,
      messageObj: {
      'message': 'Invalid id provided.',
      'long_message': 'Id can only be integer.',
      },
    };
  }
  const client = db.prepare('select * from clients where id = ? limit 1').get(id);
  if (!client) {
    return {
      valid: false,
      messageObj: {
      'message': 'Invalid id provided.',
      'long_message': 'Cannot find client with that id.',
      },
    };
  }
  return {
    valid: true,
  };
}

/**
 * Validate priority input
 * @param {any} priority
 */
const validatePriority = (priority) => {
  if (Number.isNaN(priority)) {
    return {
      valid: false,
      messageObj: {
      'message': 'Invalid priority provided.',
      'long_message': 'Priority can only be positive integer.',
      },
    };
  }
  return {
    valid: true,
  }
}

/**
 * Get all of the clients. Optional filter 'status'
 * GET /api/v1/clients?status={status} - list all clients, optional parameter status: 'backlog' | 'in-progress' | 'complete'
 */
app.get('/api/v1/clients', (req, res) => {
  const status = req.query.status;
  const priority = req.query.priority;
  if (status) {
    // status can only be either 'backlog' | 'in-progress' | 'complete'
    if (status !== 'backlog' && status !== 'in-progress' && status !== 'complete') {
      return res.status(400).send({
        'message': 'Invalid status provided.',
        'long_message': 'Status can only be one of the following: [backlog | in-progress | complete].',
      });
    }
    const clients = db.prepare('select * from clients where status = ? ORDER BY priority=?').all(status , priority );
    console.log( clients )
    return res.status(200).send(clients);
  }
  const statement = db.prepare('select * from clients');
  const clients = statement.all();
  return res.status(200).send(clients);
});

/**
 * Get a client based on the id provided.
 * GET /api/v1/clients/{client_id} - get client by id
 */
app.get('/api/v1/clients/:id', (req, res) => {
  const id = parseInt(req.params.id , 10);
  const { valid, messageObj } = validateId(id);
  if (!valid) {
    res.status(400).send(messageObj);
  }
  return res.status(200).send(db.prepare('select * from clients where id = ?').get(id));
});

/**
 * Update client information based on the parameters provided.
 * When status is provided, the client status will be changed
 * When priority is provided, the client priority will be changed with the rest of the clients accordingly
 * Note that priority = 1 means it has the highest priority (should be on top of the swimlane).
 * No client on the same status should not have the same priority.
 * This API should return list of clients on success
 *
 * PUT /api/v1/clients/{client_id} - change the status of a client
 *    Data:
 *      status (optional): 'backlog' | 'in-progress' | 'complete',
 *      priority (optional): integer,
 *
 */
// PUT /api/v1/clients/reorder
app.put('/api/v1/clients/reorder', (req, res) => {
  const { clients } = req.body;
  console.log(clients); // Should log your array
     // Should log "test"
 if( !clients ){
   return res.status( 400 ).send( 'empty client list')
 }

  // clients.map( (client, index ) => client.priority = index + 1 )
  
  const update = db.prepare("UPDATE clients SET priority = ? WHERE id = ?")
  const transaction = db.transaction( ( clients ) => {
    for( const [ index, client ]  of clients.entries() ){
      const newPriority = index + 1;
      update.run( newPriority, client.id )
    }
  })
  
  transaction(clients);
  res.status(200).json( clients );
});


app.put('/api/v1/clients/lane-change', (req, res) => {

  const { sourceClientGroup, targetGroup } = req.body;
   if( !(sourceClientGroup && targetGroup )){
   return res.status( 400 ).send( 'No source or target swimlane clients')
 }

  
  const update = db.prepare("UPDATE clients SET status = ? , priority = ? WHERE id = ?")  
  const transaction = db.transaction( ( clients ) => {

    for( const [ index, client ]  of clients.entries() ){
      const newPriority = index + 1;
      update.run( client.status, newPriority, client.id )
    }
  })
  
  transaction(sourceClientGroup);    
  transaction(targetGroup);
  res.status(200).json( "status and priorty updated" );
});



app.put('/api/v1/clients/:id', (req, res) => { //this api works correctly only when a client moved from one swimlabe to the END of next swimlane
  const id = parseInt(req.params.id , 10);
  const { valid, messageObj } = validateId
  if (!valid) {
    return res.status(400).send(messageObj);
  }

  let { status, priority } = req.body;
  let clients = db.prepare('select * from clients').all();
  const client = clients.find(client => client.id === id);

  /* ---------- Update code below ----------*/
  if( client ){
    client.status = status;
    client.priority = priority;
    console.log( client)
    db.prepare(`update clients set status = @status , priority = @priority where id = @id`).run(client)
  }

  return res.status(200).send(clients);
});



app.listen(3001);
console.log('app running on port ', 3001);
