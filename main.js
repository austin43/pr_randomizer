// eslint-disable-next-line import/prefer-default-export
import aws from 'aws-sdk'
aws.config.update({
  region: 'us-east-1'
})

export const index = async(event, context, cb) => {
  const db = new aws.DynamoDB.DocumentClient()

  const rows = await db.scan({
    TableName : 'PrRandomizerMain'
  }).promise()

  console.log(rows)

  const response = {
    text: 'this is text'
  }

  cb(null, response)
}
