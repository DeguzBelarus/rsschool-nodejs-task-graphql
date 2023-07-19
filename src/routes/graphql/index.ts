import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { createGqlResponseSchema, gqlResponseSchema } from './schemas.js';
import {
  graphql,
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLFloat,
  GraphQLInt,
  GraphQLEnumType,
  GraphQLList,
  GraphQLString,
  GraphQLBoolean,
} from 'graphql';
import { UUIDType } from "./types/uuid.js";

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  const { prisma } = fastify;
  const MemberTypeId = new GraphQLEnumType({
    name: 'MemberTypeId',
    values: {
      'basic': {
        value: 'basic'
      },
      'business': {
        value: 'business'
      }
    }
  });

  const MemberType = new GraphQLObjectType({
    name: 'MemberType',
    fields: {
      id: { type: MemberTypeId },
      discount: { type: GraphQLFloat },
      postsLimitPerMonth: { type: GraphQLInt },
    }
  });

  const PostType = new GraphQLObjectType({
    name: 'PostType',
    fields: {
      id: { type: UUIDType },
      title: { type: GraphQLString },
      content: { type: GraphQLString },
      authorId: { type: UUIDType },
    }
  });

  const ProfileType = new GraphQLObjectType({
    name: 'ProfileType',
    fields: {
      id: { type: UUIDType },
      isMale: { type: GraphQLBoolean },
      yearOfBirth: { type: GraphQLInt },
    }
  });

  const UserWithNullProfileIdType = new GraphQLObjectType({
    name: 'UserWithNullProfileIdType',
    fields: {
      id: { type: UUIDType }
    }
  });

  const UserType = new GraphQLObjectType({
    name: 'UserType',
    fields: {
      id: { type: UUIDType },
      name: { type: GraphQLString },
      balance: { type: GraphQLFloat },
      profile: { type: UserWithNullProfileIdType }
    }
  });

  const RootQueryType = new GraphQLObjectType({
    name: 'RootQueryType',
    fields: () => ({
      memberTypes: {
        type: new GraphQLList(MemberType),
        async resolve() {
          return await prisma.memberType.findMany();
        }
      },
      memberType: {
        type: MemberType,
        args: { id: { type: MemberTypeId } },
        async resolve(_, args: { id: string }) {
          return await prisma.memberType.findUnique({ where: { id: args.id } });
        }
      },
      posts: {
        type: new GraphQLList(PostType),
        async resolve() {
          return await prisma.post.findMany();
        }
      },
      post: {
        type: PostType,
        args: { id: { type: UUIDType } },
        async resolve(_, args: { id: string }) {
          return await prisma.post.findUnique({ where: { id: args.id } }) || null;
        }
      },
      profiles: {
        type: new GraphQLList(ProfileType),
        async resolve() {
          return await prisma.profile.findMany();
        }
      },
      profile: {
        type: ProfileType,
        args: { id: { type: UUIDType } },
        async resolve(_, args: { id: string }) {
          return await prisma.profile.findUnique({ where: { id: args.id } }) || null;
        }
      },
      users: {
        type: new GraphQLList(UserType),
        async resolve() {
          return await prisma.user.findMany();
        }
      },
      user: {
        type: UserType,
        args: { id: { type: UUIDType } },
        async resolve(_, args: { id: string, userWithNullProfileId: undefined | string }) {
          if (args.userWithNullProfileId) return { userWithNullProfileId: null };
          return await prisma.user.findUnique({ where: { id: args.id } }) || null;
        }
      },
    }),
  });

  const schema = new GraphQLSchema({
    query: RootQueryType,
  });

  fastify.route({
    url: '/',
    method: 'POST',
    schema: {
      ...createGqlResponseSchema,
      response: {
        200: gqlResponseSchema,
      },
    },
    async handler(request) {
      return await graphql({
        schema,
        source: request.body.query,
        variableValues: request.body.variables,
      });
    },
  });
};

export default plugin;
