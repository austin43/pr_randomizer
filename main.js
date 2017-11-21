// eslint-disable-next-line import/prefer-default-export
import aws from 'aws-sdk'
import axios from 'axios'
import queryString from 'query-string'
aws.config.update({
  region: 'us-east-1'
})
import env from './.env.json'
import _ from 'lodash'
const db = new aws.DynamoDB.DocumentClient()
const table = env.TABLE_NAME
const incomingHookUrl = env.INCOMING_SLACK_HOOK_URL

const addUser = async(id, name) => {

  const user = await db.get({
    TableName: table,
    Key: {
      SlackUserId: id
    }
  }).promise()

  if(!_.get(user, 'Item.SlackUserId')) {
    return await db.put({
      TableName : table,
      Item: {
        SlackUserId: id,
        Name: name,
        Tickets: 1
      }
    }).promise()
  } else {
    return false
  }
}

const constructResponse = (response) => {
  return {
    statusCode: '200',
    body: response ? JSON.stringify({ text: response }) : null,
    headers: {
      'Content-Type': 'application/json',
    }
  }
}

const sendMessage = async(message, showTicketList) => {
  const newDevList = await getDevelopers()
  let devTicketList = '*Tickets in hat:*\n'
  for(const dev of newDevList) {
    devTicketList += `${dev.Name} : ${dev.Tickets} \n`
  }

  let msg
  if(showTicketList) msg = message + devTicketList
  else msg = message

  await axios.post(incomingHookUrl, {
    text: msg
  }, {
    'Content-Type': 'application/json'
  })
}

const resetChosenDeveloperTickets = async(dev) => {

  console.log(dev, 'DEV')

  await db.put({
    TableName : table,
    Item: {
      SlackUserId: dev.SlackUserId,
      Name: dev.Name,
      Tickets: 0
    }
  }).promise()
}

const incrementUnchosenDeveloperTickets = async(devs) => {
  for(const dev of devs) {
    console.log(dev, 'DEV UNCHOSEN')
    await db.put({
      TableName : table,
      Item: {
        SlackUserId: dev.SlackUserId,
        Name: dev.Name,
        Tickets: dev.Tickets + 1
      }
    }).promise()
  }
}

const randomizeAndDecide = (hat) => {
  const randomizedHat = _.shuffle(hat)
  const number = _.random(0, hat.length-1)
  return randomizedHat[number]
}

const getDevelopers = async() => {
  const scan = await db.scan({
    TableName : table
  }).promise()

  const devs = scan.Items
  for(const dev of devs) {
    if(dev.Tickets === undefined || dev.Tickets === null) dev.Tickets = 1
  }

  return _.orderBy(devs, ['Tickets', 'Name'], ['desc', 'desc'])
}

export const index = async(event, context, cb) => {
  const slackInfo = queryString.parse(event.body)
  const { user_id, user_name, text } = slackInfo
  const [ command, prName ] = text.split(' ')

  let response = ''
  const newDevObj = {}

  if(command === 'add') {
    const user = await addUser(user_id, user_name)
    if(!user) response = 'Your name is already in the hat'
    else response = 'Added your name to the hat'
  } else if(command === 'assign') {
    if(!prName) return cb(null, constructResponse('Please enter a valid PR name'))
    const developers = await getDevelopers()
    if(developers.length < 3) return cb(null, constructResponse('3 or more developers must have their name in the hat before you may assign a PR'))
    const devsNotIncludingSelf = _.filter(developers, (dev) => dev.SlackUserId !== user_id)

    const hat = []
    for(const dev of devsNotIncludingSelf) {
      const tickets = dev.Tickets
      for(let i = 0; i < tickets; i++) {
        hat.push(dev.SlackUserId)
      }
    }

    const chosenDeveloperId = randomizeAndDecide(hat)

    await incrementUnchosenDeveloperTickets(developers)
    await resetChosenDeveloperTickets(_.find(devsNotIncludingSelf, (dev) => dev.SlackUserId === chosenDeveloperId))

    const message = `:tada: *${user_name} assigned \`${prName}\` to <@${chosenDeveloperId}>* :tada:\n`
    await sendMessage(message, true)
  } else if(command === 'list') {
    await sendMessage(`${user_name} listed `, true)
  } else if(command === 'help') {
    response = 'Commands: \n assign: assign [PR NAME] \n list: show the tickets in the hat'
  } else {
    response = 'Invalid command; type `/pr help` for help using this command'
  }

  cb(null, constructResponse(response))
};
