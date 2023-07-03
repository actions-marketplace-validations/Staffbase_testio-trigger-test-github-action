import * as github from "@actions/github";
import * as core from "@actions/core";
import {Octokit} from "@octokit/rest";
import {Util} from "./Util";
import betterAjvErrors from "better-ajv-errors";
import * as fs from "fs";

async function createPayload() {
    const commentID: number = Number(process.env.TESTIO_SUBMIT_COMMENT_ID);
    const commentUrl = `${process.env.TESTIO_SUBMIT_COMMENT_URL}`;
    const errorFileName = `${process.env.TESTIO_ERROR_MSG_FILE}`;

    const octokit = new Octokit({
        auth: process.env.GITHUB_TOKEN
    });

    const retrievedComment = await octokit.rest.issues.getComment({
        repo: github.context.repo.repo,
        owner: github.context.repo.owner,
        comment_id: commentID
    });
    core.setOutput("testio-submit-comment-id", commentID);

    const commentContents = `${retrievedComment.data.body}`;
    if (!commentContents) Util.throwErrorAndPrepareErrorMessage(`Comment ${commentUrl} seems to be empty`, errorFileName);
    const triggerCommentUrl = Util.getUrlFromComment(commentContents);
    if (triggerCommentUrl != undefined) {
        core.setOutput("testio-create-comment-url", triggerCommentUrl);
    } else {
        core.setOutput("testio-create-comment-url", "");
    }

    const jsonRegex = /```json\s(.+)\s```/sm;       // everything between ```json and ``` so that we can parse it
    let preparation: any;
    try {
        preparation = Util.getJsonObjectFromComment(jsonRegex, commentContents, 1);
    } catch (error) {
        Util.throwErrorAndPrepareErrorMessage(JSON.stringify(error), errorFileName);
    }

    const prepareTestSchemaFile = 'resources/exploratory_test_comment_prepare_schema.json';
    const {valid, validation} = Util.validateObjectAgainstSchema(preparation, prepareTestSchemaFile);
    if (!valid) {
        if (validation.errors) {
            const output = betterAjvErrors(prepareTestSchemaFile, preparation, validation.errors);
            console.log(output);
            Util.throwErrorAndPrepareErrorMessage(`Provided json is not conform to schema: ${output}`, errorFileName);
        }
        Util.throwErrorAndPrepareErrorMessage("Provided json is not conform to schema", errorFileName);
    }

    const testIOPayload = Util.convertPrepareObjectToTestIOPayload(preparation, github.context.repo.repo, github.context.repo.owner, github.context.issue.number);
    console.log("Converted payload:");
    console.log(testIOPayload);
    const payloadFile = 'resources/testio_payload.json';
    await fs.writeFile(payloadFile, JSON.stringify(testIOPayload), (err) => {
        if (err) Util.throwErrorAndPrepareErrorMessage(err.message, errorFileName);
        console.log(`The payload file ${payloadFile} has been saved successfully`);
    });
}

createPayload().then();